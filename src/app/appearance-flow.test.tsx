import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { appearanceKeys } from '@/entities/appearance/api'
import type { AppearanceRequest } from '@/entities/appearance/types'
import type { MyChannel } from '@/entities/member/types'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import {
  expectFieldError,
  expectNoFieldError,
  expectSubmitBlocked,
  expectSubmitOpen,
} from '@/test/fieldError'
import { noAppearanceRating } from '@/test/memberProfile'
import { server } from '@/test/server'
import { expectSuccessToast } from '@/test/toast'

const GUEST_ID = 8
const HOST_ID = 9
/** 역할 탭 이름. 응답할 일 개수가 있으면 뒤에 ', 응답 필요 N건'이 붙는다 */
const HOST_TAB = /^호스트로 \(보낸 요청\)/
const GUEST_TAB = /^게스트로 \(받은 요청\)/

const profile = (id: number, nickname: string) => ({
  id,
  nickname,
  role: 'INFLUENCER',
  profileImageUrl: null,
  channels: [],
  appearanceRating: noAppearanceRating,
})

const myChannel: MyChannel = {
  id: 1,
  platform: 'CHZZK',
  channelName: '하늘 채널',
  channelUrl: 'https://chzzk.naver.com/sky',
  followerCount: 50,
  followerCountAt: null,
  status: 'APPROVED',
  rejectionReason: null,
  requestedAt: null,
}

const request = (
  patch: Partial<AppearanceRequest> = {},
): AppearanceRequest => ({
  id: 30,
  hostId: HOST_ID,
  guestId: ME_ID,
  title: '주말 게임 합방',
  hostChannelUrl: 'https://chzzk.naver.com/host',
  scheduledAt: '2999-10-20T21:00:00',
  expectedMinutes: 90,
  content: '공포 게임 2인 플레이',
  fee: 30000,
  acceptDeadline: '2999-10-18T23:59:00',
  status: 'REQUESTED',
  version: 3,
  rejectReason: null,
  respondedAt: null,
  canceledAt: null,
  appearanceId: null,
  hpReleaseStatus: null,
  createdAt: '2026-10-14T10:00:00',
  updatedAt: '2026-10-14T10:00:00',
  ...patch,
})

/** 게스트 프로필과 내 채널 */
function mockGuestProfile() {
  server.use(
    http.get(`*/api/v1/members/${GUEST_ID}`, () =>
      rs(profile(GUEST_ID, '편집하는 고래')),
    ),
    http.get('*/api/v1/members/channels/me', () => rs([myChannel])),
  )
}

/** 요청서 상세와 상대(호스트) 프로필. 상태는 바뀔 수 있다 */
function mockRequestDetail(current: { value: AppearanceRequest }) {
  server.use(
    http.get('*/api/v1/appearances/requests/30', () => rs(current.value)),
    http.get(`*/api/v1/members/${HOST_ID}`, () =>
      rs(profile(HOST_ID, '밤새는곰')),
    ),
    http.get(`*/api/v1/members/${ME_ID}`, () => rs(profile(ME_ID, '하늘'))),
  )
}

async function openRequestForm() {
  await userEvent.click(
    await screen.findByRole('button', { name: '출연 요청 보내기' }),
  )
  return screen.findByRole('dialog', { name: '출연 요청 보내기' })
}

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('출연 요청 보내기', () => {
  it('프로필에서 요청을 보내면 HP를 보류하고 보낸 요청 목록으로 간다', async () => {
    mockGuestProfile()
    let body: Record<string, unknown> | undefined
    const created = {
      value: request({ id: 30, hostId: ME_ID, guestId: GUEST_ID }),
    }
    server.use(
      http.post('*/api/v1/appearances/requests', async ({ request: req }) => {
        body = (await req.json()) as Record<string, unknown>
        return rs(created.value, 201)
      }),
      http.get('*/api/v1/appearances/requests/sent', () =>
        rs({
          content: [created.value],
          page: { size: 10, number: 0, totalElements: 1, totalPages: 1 },
        }),
      ),
    )
    const router = renderApp(`/influencers/${GUEST_ID}`, 'INFLUENCER')

    const dialog = await openRequestForm()
    // 승인된 내 채널로 채운다
    expect(
      await within(dialog).findByDisplayValue('https://chzzk.naver.com/sky'),
    ).toBeInTheDocument()
    await userEvent.type(
      within(dialog).getByLabelText('제목'),
      '주말 게임 합방',
    )
    await userEvent.type(
      within(dialog).getByLabelText('요청 내용'),
      '공포 게임 2인',
    )
    const fee = within(dialog).getByLabelText('출연료 (HP)')
    await userEvent.clear(fee)
    await userEvent.type(fee, '30000')
    await userEvent.click(
      await within(dialog).findByRole('button', {
        name: '30,000 HP 보류하고 요청',
      }),
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/appearances'),
    )
    expect(router.state.location.search).toBe('?tab=host')
    await expectSuccessToast('편집하는 고래 님에게 출연 요청을 보냈어요.')
    expect(screen.queryByText(/포인트를 확인하고 있어요/)).toBeNull()
    expect(body).toMatchObject({
      guestId: GUEST_ID,
      title: '주말 게임 합방',
      hostChannelUrl: 'https://chzzk.naver.com/sky',
      content: '공포 게임 2인',
      fee: 30000,
      expectedMinutes: 60,
    })
    // datetime-local 값을 BE LocalDateTime(초까지)으로 보낸다
    expect(body?.scheduledAt).toMatch(/^\d{4}-\d{2}-\d{2}T21:00:00$/)
    expect(body?.acceptDeadline).toMatch(/^\d{4}-\d{2}-\d{2}T23:59:00$/)
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('수락 기한이 방송 예정 일시보다 늦으면 보내지 않는다', async () => {
    mockGuestProfile()
    let posts = 0
    server.use(
      http.post('*/api/v1/appearances/requests', () => {
        posts++
        return rs(request(), 201)
      }),
    )
    renderApp(`/influencers/${GUEST_ID}`, 'INFLUENCER')

    const dialog = await openRequestForm()
    await userEvent.type(within(dialog).getByLabelText('제목'), '합방')
    await userEvent.type(within(dialog).getByLabelText('요청 내용'), '내용')
    const deadline = within(dialog).getByLabelText('수락 기한')
    await userEvent.clear(deadline)
    await userEvent.type(deadline, '2999-12-31T10:00')
    await userEvent.click(
      await within(dialog).findByRole('button', { name: /HP 보류하고 요청/ }),
    )

    expect(
      await within(dialog).findByText(
        '수락 기한은 방송 예정 일시보다 앞서야 해요.',
      ),
    ).toBeInTheDocument()
    expect(posts).toBe(0)
  })

  it('HP가 모자라면 충전으로 안내한다', async () => {
    mockGuestProfile()
    renderApp(`/influencers/${GUEST_ID}`, 'INFLUENCER', {
      revenueBalanceHp: 0,
      availableTotalHp: 10000,
    })
    const dialog = await openRequestForm()
    expect(await within(dialog).findByText('10,000 HP')).toBeInTheDocument()
    expect(
      within(dialog).getByRole('link', { name: 'HP 충전하러 가기' }),
    ).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/wallet\?charge=\d+000$/),
    )
  })

  it('잔액이 부족하면(409 INSUFFICIENT_BALANCE) 충전 안내를 보여 준다', async () => {
    mockGuestProfile()
    server.use(
      http.post('*/api/v1/appearances/requests', () =>
        HttpResponse.json(
          {
            status: 409,
            code: 'INSUFFICIENT_BALANCE',
            detail: 'HP 잔액이 부족합니다.',
          },
          { status: 409 },
        ),
      ),
    )
    renderApp(`/influencers/${GUEST_ID}`, 'INFLUENCER')

    const dialog = await openRequestForm()
    await userEvent.type(within(dialog).getByLabelText('제목'), '합방')
    await userEvent.type(within(dialog).getByLabelText('요청 내용'), '내용')
    await userEvent.click(
      await within(dialog).findByRole('button', { name: /HP 보류하고 요청/ }),
    )

    expect(
      await within(dialog).findByText(
        'HP가 부족해 요청을 보내지 못했어요. 충전한 뒤 다시 보내 주세요.',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('link', { name: 'HP 충전하러 가기' }),
    ).toBeInTheDocument()
  })

  it('유저는 요청 대신 채널 인증을 안내받는다', async () => {
    mockGuestProfile()
    renderApp(`/influencers/${GUEST_ID}`, 'USER')
    expect(
      await screen.findByRole('link', { name: '채널 인증하기' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '출연 요청 보내기' }),
    ).toBeNull()
  })
})

describe('출연 요청서 입력 오류', () => {
  it('제목을 비운 채 떠나면 제목에 오류를 보여 주고, 필수 값이 비어 있으면 요청 버튼을 막는다', async () => {
    mockGuestProfile()
    renderApp(`/influencers/${GUEST_ID}`, 'INFLUENCER')

    const dialog = await openRequestForm()
    const submit = await within(dialog).findByRole('button', {
      name: /HP 보류하고 요청/,
    })
    expectSubmitBlocked(submit)
    const title = within(dialog).getByLabelText('제목')
    expectNoFieldError(title)

    await userEvent.click(title)
    await userEvent.tab()
    expectFieldError(title, '제목을 입력해 주세요.')
    // 건드리지 않은 아래 칸은 오류가 없다.
    expectNoFieldError(within(dialog).getByLabelText('요청 내용'))

    await userEvent.type(title, '주말 게임 합방')
    expectNoFieldError(title)
    expectSubmitBlocked(submit)
    await userEvent.type(
      within(dialog).getByLabelText('요청 내용'),
      '공포 게임 2인',
    )
    expectSubmitOpen(submit)
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })
})

describe('요청서 상세의 호스트 채널', () => {
  it('정상 주소는 새 탭 링크다', async () => {
    mockRequestDetail({ value: request() })
    renderApp('/appearances/requests/30', 'INFLUENCER')
    const link = await screen.findByRole('link', {
      name: 'https://chzzk.naver.com/host',
    })
    expect(link).toHaveAttribute('href', 'https://chzzk.naver.com/host')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('탈퇴로 파기된 채널(withdrawn)은 링크 없이 안내 글자로 보인다', async () => {
    mockRequestDetail({
      value: request({ hostChannelUrl: 'withdrawn', status: 'EXPIRED' }),
    })
    renderApp('/appearances/requests/30', 'INFLUENCER')
    const channel = (await screen.findByText('호스트 채널'))
      .nextElementSibling as HTMLElement
    expect(within(channel).getByText('탈퇴한 회원의 채널')).toBeInTheDocument()
    expect(within(channel).queryByRole('link')).toBeNull()
  })
})

describe('받은 출연 요청', () => {
  it('목록에서 요청서를 열어 본 버전 그대로 수락한다', async () => {
    const current = { value: request() }
    let accepted: unknown
    mockRequestDetail(current)
    server.use(
      http.get('*/api/v1/appearances/requests/received', () =>
        rs({
          content: [current.value],
          page: { size: 10, number: 0, totalElements: 1, totalPages: 1 },
        }),
      ),
      http.post(
        '*/api/v1/appearances/requests/30/accept',
        async ({ request: req }) => {
          accepted = await req.json()
          current.value = request({
            status: 'ACCEPTED',
            respondedAt: '2026-10-14T12:00:00',
          })
          return rs(current.value)
        },
      ),
    )
    renderApp('/appearances?tab=guest', 'INFLUENCER')

    await userEvent.click(
      await screen.findByRole('link', { name: /주말 게임 합방/ }),
    )
    // 목록 카드에도 같은 이름이 있으므로, 상세 화면 제목이 뜬 뒤에 확인한다.
    expect(
      await screen.findByRole('heading', { name: '주말 게임 합방' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('밤새는곰')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: '수락' }))
    const dialog = await screen.findByRole('dialog', {
      name: '이 조건으로 수락할까요?',
    })
    await userEvent.click(within(dialog).getByRole('button', { name: '수락' }))

    expect(await screen.findByText('출연 성립')).toBeInTheDocument()
    expect(accepted).toEqual({ version: 3 })
  })

  it('그사이 요청서가 바뀌었으면 다시 확인하라고 알린다', async () => {
    const current = { value: request() }
    mockRequestDetail(current)
    server.use(
      http.post('*/api/v1/appearances/requests/30/accept', () => {
        current.value = request({ title: '바뀐 제목', version: 4 })
        return HttpResponse.json(
          { status: 409, code: 'APPEARANCE_REQUEST_MODIFIED', detail: '바뀜' },
          { status: 409 },
        )
      }),
    )
    renderApp('/appearances/requests/30', 'INFLUENCER')

    await userEvent.click(await screen.findByRole('button', { name: '수락' }))
    const dialog = await screen.findByRole('dialog', {
      name: '이 조건으로 수락할까요?',
    })
    await userEvent.click(within(dialog).getByRole('button', { name: '수락' }))

    expect(
      await screen.findByText(
        '호스트가 요청서를 고쳤어요. 바뀐 내용을 확인한 뒤 다시 수락해 주세요.',
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: '바뀐 제목' }),
    ).toBeInTheDocument()
  })

  it('거절 사유를 함께 보낸다', async () => {
    const current = { value: request() }
    let rejected: unknown
    mockRequestDetail(current)
    server.use(
      http.post(
        '*/api/v1/appearances/requests/30/reject',
        async ({ request: req }) => {
          rejected = await req.json()
          // 반환을 처리하지 못한(DEAD) 응답이어도 거절은 성공이다.
          current.value = request({
            status: 'REJECTED',
            rejectReason: '일정이 겹쳐요',
            hpReleaseStatus: 'DEAD',
          })
          return rs(current.value)
        },
      ),
    )
    renderApp('/appearances/requests/30', 'INFLUENCER')

    await userEvent.click(await screen.findByRole('button', { name: '거절' }))
    const dialog = await screen.findByRole('dialog', {
      name: '출연 요청을 거절할까요?',
    })
    await userEvent.type(
      within(dialog).getByLabelText('거절 사유 (선택)'),
      '일정이 겹쳐요',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: '거절' }))

    await expectSuccessToast('출연 요청을 거절했어요.')
    expect(await screen.findByText('거절됨 · HP 반환')).toBeInTheDocument()
    expect(rejected).toEqual({ reason: '일정이 겹쳐요' })
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })
})

describe('보낸 출연 요청', () => {
  it('응답 전 요청을 취소하면 HP 반환 상태를 보여 준다', async () => {
    const current = { value: request({ hostId: ME_ID, guestId: HOST_ID }) }
    mockRequestDetail(current)
    server.use(
      http.post('*/api/v1/appearances/requests/30/cancel', () => {
        current.value = request({
          hostId: ME_ID,
          guestId: HOST_ID,
          status: 'CANCELED',
          canceledAt: '2026-10-14T12:00:00',
          hpReleaseStatus: 'PENDING',
        })
        return rs(current.value)
      }),
    )
    renderApp('/appearances/requests/30', 'INFLUENCER')

    expect(await screen.findByText('수락 대기')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '수락' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '요청 취소' }))
    const dialog = await screen.findByRole('dialog', {
      name: '출연 요청을 취소할까요?',
    })
    await userEvent.click(
      within(dialog).getByRole('button', { name: '요청 취소' }),
    )

    await expectSuccessToast('출연 요청을 취소했어요.')
    expect(await screen.findByText('요청 취소 · HP 반환')).toBeInTheDocument()
    expect(screen.getByText('보류 HP 반환 처리 중이에요.')).toBeInTheDocument()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })
})

describe('요청서 고치기 입력 오류', () => {
  it('요청 내용을 비운 채 떠나면 오류를 보여 주고 저장을 막는다', async () => {
    mockRequestDetail({ value: request({ hostId: ME_ID, guestId: HOST_ID }) })
    renderApp('/appearances/requests/30', 'INFLUENCER')

    await userEvent.click(
      await screen.findByRole('button', { name: '요청서 고치기' }),
    )
    const dialog = await screen.findByRole('dialog', { name: '요청서 고치기' })
    const content = within(dialog).getByLabelText('요청 내용')
    await userEvent.clear(content)
    expectNoFieldError(content)
    await userEvent.tab()

    expectFieldError(content, '요청 내용을 입력해 주세요.')
    expectSubmitBlocked(within(dialog).getByRole('button', { name: '저장' }))

    // Enter 제출(form submit)도 보내지 않고 첫 오류 칸(요청 내용)으로 포커스한다.
    // 저장 버튼이 form 밖(모달 footer)이라 user-event는 Enter 암묵 제출을 흉내 내지 않아 submit을 직접 보낸다.
    const titleInput = within(dialog).getByLabelText<HTMLInputElement>('제목')
    await userEvent.click(titleInput)
    fireEvent.submit(titleInput.form!)
    await waitFor(() => expect(content).toHaveFocus())
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })
})

describe('리뷰 반영', () => {
  it('확인창을 연 뒤 상세가 새 버전으로 바뀌어도 연 순간의 버전으로 수락한다', async () => {
    const current = { value: request({ version: 3 }) }
    let sent: unknown
    mockRequestDetail(current)
    server.use(
      http.post(
        '*/api/v1/appearances/requests/30/accept',
        async ({ request: req }) => {
          sent = await req.json()
          return HttpResponse.json(
            {
              status: 409,
              code: 'APPEARANCE_REQUEST_MODIFIED',
              detail: '바뀜',
            },
            { status: 409 },
          )
        },
      ),
    )
    renderApp('/appearances/requests/30', 'INFLUENCER')

    await userEvent.click(await screen.findByRole('button', { name: '수락' }))
    const dialog = await screen.findByRole('dialog', {
      name: '이 조건으로 수락할까요?',
    })
    // 확인창이 열린 동안 상세 캐시가 버전 4로 갱신된다(다른 화면의 재조회 등).
    act(() => {
      queryClient.setQueryData(
        appearanceKeys.request(30),
        request({ version: 4, title: '몰래 바뀐 제목' }),
      )
    })
    expect(within(dialog).getByText('주말 게임 합방')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '수락' }))

    await waitFor(() => expect(sent).toEqual({ version: 3 }))
    // 막히면 확인창을 닫고 바뀐 내용을 다시 보여 준다.
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: '이 조건으로 수락할까요?' }),
      ).toBeNull(),
    )
  })

  it('HP 보류가 지연되면(503) 다시 보내지 않고 보낸 요청 목록으로 간다', async () => {
    mockGuestProfile()
    let posts = 0
    server.use(
      http.post('*/api/v1/appearances/requests', () => {
        posts++
        return HttpResponse.json(
          {
            status: 503,
            code: 'BILLING_UNAVAILABLE',
            detail: 'HP 보류 처리가 지연되고 있습니다.',
          },
          { status: 503 },
        )
      }),
      http.get('*/api/v1/appearances/requests/sent', () =>
        rs({
          content: [],
          page: { size: 10, number: 0, totalElements: 0, totalPages: 0 },
        }),
      ),
    )
    const router = renderApp(`/influencers/${GUEST_ID}`, 'INFLUENCER')

    const dialog = await openRequestForm()
    await userEvent.type(within(dialog).getByLabelText('제목'), '합방')
    await userEvent.type(within(dialog).getByLabelText('요청 내용'), '내용')
    await userEvent.click(
      await within(dialog).findByRole('button', { name: /HP 보류하고 요청/ }),
    )

    await expectSuccessToast('접수됐어요. 포인트를 확인하고 있어요.')
    expect(router.state.location.pathname).toBe('/appearances')
    // 주소값 없이 보낸 요청으로 간다. 그 요청서는 목록에 '포인트 확인 중'으로 보인다.
    expect(router.state.location.search).toBe('?tab=host')
    expect(
      await screen.findByText('아직 보낸 출연 요청이 없어요'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('dialog', { name: '출연 요청 보내기' }),
    ).toBeNull()
    expect(posts).toBe(1)
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('보낸 요청은 보류 실패를 뺀 상태를 요청하고, 보류 확인 중인 요청서가 있는 동안만 다시 부른다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    let status: AppearanceRequest['status'] = 'HOLD_PENDING'
    const state = { calls: 0, statuses: [] as (string | null)[] }
    server.use(
      http.get('*/api/v1/appearances/requests/sent', ({ request: req }) => {
        state.calls++
        state.statuses.push(new URL(req.url).searchParams.get('status'))
        const content = [request({ hostId: ME_ID, guestId: HOST_ID, status })]
        return rs({
          content,
          page: { size: 10, number: 0, totalElements: 1, totalPages: 1 },
        })
      }),
    )
    renderApp('/appearances?tab=host', 'INFLUENCER')
    expect(await screen.findByText('포인트 확인 중')).toHaveClass(
      'pill',
      'warn',
    )
    expect(state.statuses[0]).toBe(
      'HOLD_PENDING,REQUESTED,ACCEPTED,REJECTED,EXPIRED,CANCELED',
    )
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    const before = state.calls
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    await waitFor(() => expect(state.calls).toBeGreaterThan(before))

    status = 'REQUESTED'
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    await waitFor(() => expect(screen.queryByText('포인트 확인 중')).toBeNull())
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    const stopped = state.calls
    await act(() => vi.advanceTimersByTimeAsync(20_000))
    expect(state.calls).toBe(stopped)
  })

  it("'등록 실패' 보기는 보류 실패 요청서만 보이고, 받은 요청에는 보기가 없다", async () => {
    const statuses: (string | null)[] = []
    server.use(
      http.get('*/api/v1/appearances/requests/sent', ({ request: req }) => {
        const status = new URL(req.url).searchParams.get('status')
        statuses.push(status)
        const content =
          status === 'HOLD_FAILED'
            ? [
                request({
                  hostId: ME_ID,
                  guestId: HOST_ID,
                  status: 'HOLD_FAILED',
                }),
              ]
            : []
        return rs({
          content,
          page: {
            size: 10,
            number: 0,
            totalElements: content.length,
            totalPages: content.length,
          },
        })
      }),
      http.get('*/api/v1/appearances/requests/received', ({ request: req }) => {
        statuses.push(`received:${new URL(req.url).searchParams.get('status')}`)
        return rs({
          content: [],
          page: { size: 10, number: 0, totalElements: 0, totalPages: 0 },
        })
      }),
    )
    const router = renderApp('/appearances?tab=host', 'INFLUENCER')
    await screen.findByText('아직 보낸 출연 요청이 없어요')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '보기' }),
      'failed',
    )
    expect(await screen.findByText('등록되지 않음')).toHaveClass('pill', 'bad')
    expect(statuses.at(-1)).toBe('HOLD_FAILED')
    expect(new URLSearchParams(router.state.location.search).get('view')).toBe(
      'failed',
    )

    await userEvent.click(screen.getByRole('tab', { name: GUEST_TAB }))
    await screen.findByText('아직 받은 출연 요청이 없어요')
    expect(screen.queryByRole('combobox', { name: '보기' })).toBeNull()
    expect(statuses.at(-1)).toBe('received:null')
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('보류 실패 요청서 상세는 안내하고 수정·취소를 보이지 않는다', async () => {
    mockRequestDetail({
      value: request({
        hostId: ME_ID,
        guestId: HOST_ID,
        status: 'HOLD_FAILED',
      }),
    })
    renderApp('/appearances/requests/30', 'INFLUENCER')
    expect(
      await screen.findByText(
        'HP 보류에 실패해 등록되지 않았어요. 잔액을 확인한 뒤 다시 올려 주세요.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('등록되지 않음')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /고치기|수정/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /취소/ })).toBeNull()
  })

  it('탭을 바꾸는 동안 이전 역할의 목록을 새 역할로 보여 주지 않는다', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get('*/api/v1/appearances/requests/sent', () =>
        rs({
          content: [
            request({
              hostId: ME_ID,
              guestId: HOST_ID,
              title: '내가 보낸 요청',
            }),
          ],
          page: { size: 10, number: 0, totalElements: 1, totalPages: 1 },
        }),
      ),
      http.get('*/api/v1/appearances/requests/received', async () => {
        await gate
        return rs({
          content: [request({ title: '내가 받은 요청' })],
          page: { size: 10, number: 0, totalElements: 1, totalPages: 1 },
        })
      }),
      http.get(`*/api/v1/members/${HOST_ID}`, () =>
        rs(profile(HOST_ID, '밤새는곰')),
      ),
    )
    renderApp('/appearances', 'INFLUENCER')

    expect(await screen.findByText('내가 보낸 요청')).toBeInTheDocument()
    expect(screen.getByText('수락 대기')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: GUEST_TAB }))
    // 탭 전환(주소 변경)은 라우터가 낮은 우선순위로 그리므로 전환이 끝나 로딩이 보일 때까지 기다린다.
    // 받은 요청이 오기 전: 보낸 요청이 '응답 필요'로 보이지 않고 로딩한다.
    expect(await screen.findByText('불러오는 중…')).toBeInTheDocument()
    expect(screen.queryByText('내가 보낸 요청')).toBeNull()
    expect(screen.queryByText('응답 필요')).toBeNull()

    release()
    expect(await screen.findByText('내가 받은 요청')).toBeInTheDocument()
    expect(screen.getByText('응답 필요')).toBeInTheDocument()
  })
})

describe('역할 탭', () => {
  it('Tab 키로 들어오면 선택된 탭에 가고, Space로 고르면 page가 초기화되며 패널이 바뀐다', async () => {
    server.use(
      http.get('*/api/v1/appearances/requests/received', () =>
        rs({
          content: [request({ title: '내가 받은 요청' })],
          page: { size: 10, number: 1, totalElements: 11, totalPages: 2 },
        }),
      ),
      http.get('*/api/v1/appearances/requests/sent', () =>
        rs({
          content: [
            request({
              hostId: ME_ID,
              guestId: HOST_ID,
              title: '내가 보낸 요청',
            }),
          ],
          page: { size: 10, number: 0, totalElements: 1, totalPages: 1 },
        }),
      ),
      http.get(`*/api/v1/members/${HOST_ID}`, () =>
        rs(profile(HOST_ID, '밤새는곰')),
      ),
    )
    const router = renderApp('/appearances?tab=guest&page=2', 'INFLUENCER')

    const guestPanel = await screen.findByRole('tabpanel', { name: GUEST_TAB })
    expect(
      await within(guestPanel).findByText('내가 받은 요청'),
    ).toBeInTheDocument()
    const host = screen.getByRole('tab', { name: HOST_TAB })
    const guest = screen.getByRole('tab', { name: GUEST_TAB })
    expect(guest).toHaveAttribute('aria-controls', guestPanel.id)

    // 탭 목록 바로 앞의 링크(머리 버튼 '출연 모집')에서 Tab을 누르면 선택된 탭으로 들어온다.
    const head = screen
      .getByRole('heading', { level: 1, name: '내 출연' })
      .closest('.page-head') as HTMLElement
    within(head).getByRole('link', { name: '출연 모집' }).focus()
    await userEvent.tab()
    expect(guest).toHaveFocus()

    await userEvent.keyboard('{ArrowLeft}')
    expect(host).toHaveFocus()
    expect(router.state.location.search).toBe('?tab=guest&page=2')

    await userEvent.keyboard(' ')
    const hostPanel = await screen.findByRole('tabpanel', { name: HOST_TAB })
    expect(router.state.location.search).toBe('')
    expect(
      await within(hostPanel).findByText('내가 보낸 요청'),
    ).toBeInTheDocument()
    expect(host).toHaveAttribute('aria-selected', 'true')
  })
})
