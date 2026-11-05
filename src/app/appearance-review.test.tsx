import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { Appearance, AppearanceReview } from '@/entities/appearance/types'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'
import { expectSuccessToast } from '@/test/toast'

const PARTNER_ID = 8

const profile = (id: number, nickname: string) => ({
  id,
  nickname,
  role: 'INFLUENCER',
  profileImageUrl: null,
  channels: [],
})

/** 확인이 끝난 출연. 나(ME_ID)는 호스트 */
const appearance = (patch: Partial<Appearance> = {}): Appearance => ({
  id: 40,
  sourceType: 'REQUEST',
  requestId: 30,
  recruitId: null,
  title: '주말 게임 합방',
  hostId: ME_ID,
  guestId: PARTNER_ID,
  fee: 25000,
  scheduledAt: '2026-10-20T21:00:00',
  status: 'CONFIRMED',
  establishedAt: '2026-10-01T10:00:00',
  applicationId: null,
  canceledAt: null,
  cancelRequests: [],
  hpReleaseStatus: null,
  penaltyAmount: null,
  hostCancelReason: null,
  hpPenaltyStatus: null,
  confirmType: 'HOST',
  confirmedAt: '2026-10-21T10:00:00',
  absentAt: null,
  absentReason: null,
  hpPayoutStatus: 'DONE',
  reviewable: false,
  myReview: null,
  receivedReview: null,
  version: 3,
  createdAt: '2026-10-01T10:00:00',
  updatedAt: '2026-10-21T10:00:00',
  ...patch,
})

const review = (patch: Partial<AppearanceReview> = {}): AppearanceReview => ({
  id: 7,
  rating: 4,
  content: '진행이 매끄러웠어요',
  published: false,
  publishedAt: null,
  createdAt: '2026-10-22T10:00:00',
  ...patch,
})

/** ProblemDetail 오류 응답 */
const problem = (status: number, code: string, detail: string) =>
  HttpResponse.json(
    { status, code, detail },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )

/** 출연 상세. current.value를 바꾸면 다시 불렀을 때 바뀐 상태가 온다. 상세를 부른 횟수를 센다 */
function mockAppearance(current: { value: Appearance }) {
  const calls = { detail: 0 }
  server.use(
    http.get(`*/api/v1/members/${PARTNER_ID}`, () =>
      rs(profile(PARTNER_ID, '편집하는 고래')),
    ),
    http.get('*/api/v1/appearances/40', () => {
      calls.detail++
      return rs(current.value)
    }),
  )
  return calls
}

const reviewSection = () => screen.findByRole('region', { name: '리뷰' })

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('출연 리뷰', () => {
  it('쓸 수 있으면 별점·본문을 남기고, 다시 불러온 상세에서 공개 전 안내를 본다', async () => {
    const current = { value: appearance({ reviewable: true }) }
    const calls = mockAppearance(current)
    let body: unknown
    server.use(
      http.post('*/api/v1/appearances/40/reviews', async ({ request }) => {
        body = await request.json()
        current.value = appearance({
          myReview: review({ rating: 4, content: '재밌었어요' }),
        })
        return rs({ id: 7 }, 201)
      }),
    )
    renderApp('/appearances/40', 'INFLUENCER')
    const section = await reviewSection()
    await userEvent.click(
      within(section).getByRole('button', { name: '리뷰 쓰기' }),
    )
    const form = within(section).getByRole('form', { name: '출연 리뷰 쓰기' })
    await userEvent.click(within(form).getByRole('radio', { name: '4점' }))
    await userEvent.type(within(form).getByLabelText('리뷰'), '  재밌었어요  ')
    const before = calls.detail
    await userEvent.click(
      within(form).getByRole('button', { name: '리뷰 남기기' }),
    )

    await expectSuccessToast('리뷰를 남겼어요.')
    expect(body).toEqual({ rating: 4, content: '재밌었어요' })
    await waitFor(() => expect(calls.detail).toBeGreaterThan(before))
    const mine = await within(section).findByRole('article', {
      name: '내가 쓴 리뷰',
    })
    expect(mine).toHaveTextContent('재밌었어요')
    expect(within(mine).getByLabelText('4점')).toBeInTheDocument()
    expect(mine).toHaveTextContent('상대가 리뷰를 쓰면 함께 공개돼요.')
    expect(
      within(section).queryByRole('button', { name: '리뷰 쓰기' }),
    ).toBeNull()
  })

  it('별점은 키보드로 고른다(Tab 한 번으로 들어가 방향키로 바꾼다)', async () => {
    mockAppearance({ value: appearance({ reviewable: true }) })
    renderApp('/appearances/40', 'INFLUENCER')
    const section = await reviewSection()
    await userEvent.click(
      within(section).getByRole('button', { name: '리뷰 쓰기' }),
    )
    const five = within(section).getByRole('radio', { name: '5점' })
    expect(five).toBeChecked()
    five.focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(within(section).getByRole('radio', { name: '4점' })).toBeChecked()
    expect(within(section).getByRole('radio', { name: '4점' })).toHaveFocus()
  })

  it('본문을 비우면 별점만 보낸다', async () => {
    const current = { value: appearance({ reviewable: true }) }
    mockAppearance(current)
    let body: unknown
    server.use(
      http.post('*/api/v1/appearances/40/reviews', async ({ request }) => {
        body = await request.json()
        current.value = appearance({ myReview: review({ content: null }) })
        return rs({ id: 7 }, 201)
      }),
    )
    renderApp('/appearances/40', 'INFLUENCER')
    const section = await reviewSection()
    await userEvent.click(
      within(section).getByRole('button', { name: '리뷰 쓰기' }),
    )
    await userEvent.type(within(section).getByLabelText('리뷰'), '   ')
    await userEvent.click(
      within(section).getByRole('button', { name: '리뷰 남기기' }),
    )
    await waitFor(() => expect(body).toEqual({ rating: 5 }))
  })

  it('본문이 1,000자를 넘으면 보낼 수 없다', async () => {
    mockAppearance({ value: appearance({ reviewable: true }) })
    renderApp('/appearances/40', 'INFLUENCER')
    const section = await reviewSection()
    await userEvent.click(
      within(section).getByRole('button', { name: '리뷰 쓰기' }),
    )
    const content = within(section).getByLabelText('리뷰')
    await userEvent.click(content)
    await userEvent.paste('가'.repeat(1001))
    expect(content).toHaveAttribute('aria-invalid', 'true')
    expect(
      within(section).getByRole('button', { name: '리뷰 남기기' }),
    ).toBeDisabled()
  })

  it('함께 공개되면 내 리뷰(공개됨)와 상대가 쓴 리뷰를 보인다', async () => {
    mockAppearance({
      value: appearance({
        myReview: review({
          published: true,
          publishedAt: '2026-10-23T10:00:00',
        }),
        receivedReview: review({
          id: 8,
          rating: 5,
          content: '또 함께해요',
          published: true,
          publishedAt: '2026-10-23T10:00:00',
        }),
      }),
    })
    renderApp('/appearances/40', 'INFLUENCER')
    const section = await reviewSection()
    const mine = within(section).getByRole('article', { name: '내가 쓴 리뷰' })
    expect(mine).toHaveTextContent('공개됨')
    expect(mine).not.toHaveTextContent('함께 공개돼요')
    const received = within(section).getByRole('article', {
      name: '상대가 쓴 리뷰',
    })
    expect(received).toHaveTextContent('또 함께해요')
    expect(within(received).getByLabelText('5점')).toBeInTheDocument()
  })

  it('쓸 수 없고 쓴 리뷰도 없으면 리뷰 영역을 보이지 않는다', async () => {
    mockAppearance({ value: appearance({ status: 'ESTABLISHED' }) })
    renderApp('/appearances/40', 'INFLUENCER')
    await screen.findByRole('heading', { name: '주말 게임 합방' })
    expect(screen.queryByRole('region', { name: '리뷰' })).toBeNull()
  })

  it.each([
    ['ALREADY_REVIEWED', '이미 리뷰를 작성했습니다.'],
    ['APPEARANCE_NOT_REVIEWABLE', '리뷰를 쓸 수 없는 출연입니다.'],
    [
      'REVIEWEE_NOT_ACTIVE',
      '상대가 현재 이용할 수 없는 회원이라 리뷰를 쓸 수 없어요.',
    ],
  ])(
    '409 %s는 안내한 뒤 상세를 다시 불러와 쓰기 버튼을 없앤다',
    async (code, detail) => {
      const current = { value: appearance({ reviewable: true }) }
      const calls = mockAppearance(current)
      server.use(
        http.post('*/api/v1/appearances/40/reviews', () => {
          current.value = appearance({ reviewable: false })
          return problem(409, code, detail)
        }),
      )
      renderApp('/appearances/40', 'INFLUENCER')
      const section = await reviewSection()
      await userEvent.click(
        within(section).getByRole('button', { name: '리뷰 쓰기' }),
      )
      const before = calls.detail
      await userEvent.click(
        within(section).getByRole('button', { name: '리뷰 남기기' }),
      )
      await expectSuccessToast(detail)
      await waitFor(() => expect(calls.detail).toBeGreaterThan(before))
      await waitFor(() =>
        expect(screen.queryByRole('region', { name: '리뷰' })).toBeNull(),
      )
    },
  )
})
