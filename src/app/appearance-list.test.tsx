import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type {
  AppearanceRequest,
  AppearanceSummary,
} from '@/entities/appearance/types'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const PARTNER_ID = 8

const profile = (id: number, nickname: string) => ({
  id,
  nickname,
  role: 'INFLUENCER',
  profileImageUrl: null,
  channels: [],
})

const pageOf = <T,>(
  content: T[],
  { number = 0, totalElements = content.length, totalPages = 1 } = {},
) => ({
  content,
  page: { size: 10, number, totalElements, totalPages },
})

/** 나(ME_ID)는 호스트, 상대(PARTNER_ID)는 게스트 */
const summary = (
  patch: Partial<AppearanceSummary> = {},
): AppearanceSummary => ({
  id: 40,
  sourceType: 'REQUEST',
  requestId: 30,
  recruitId: null,
  title: '주말 게임 합방',
  hostId: ME_ID,
  guestId: PARTNER_ID,
  fee: 25000,
  scheduledAt: '2999-10-20T21:00:00',
  status: 'ESTABLISHED',
  establishedAt: '2026-10-14T10:00:00',
  ...patch,
})

/** 내(ME_ID)가 게스트로 받은 요청서 */
const received = (
  patch: Partial<AppearanceRequest> = {},
): AppearanceRequest => ({
  id: 30,
  hostId: PARTNER_ID,
  guestId: ME_ID,
  title: '받은 합방 요청',
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

const ONGOING = ['ESTABLISHED', 'CANCEL_REQUESTED']
const ENDED = [
  'CONFIRMED',
  'ABSENT',
  'CANCELED_BY_HOST',
  'CANCELED_BY_AGREEMENT',
]

/** 탭 개수 요청은 size=1이다. 목록 요청(size=10)과 나눠 본다 */
const isCount = (url: URL) => url.searchParams.get('size') === '1'

function mockPartner() {
  server.use(
    http.get(`*/api/v1/members/${PARTNER_ID}`, () =>
      rs(profile(PARTNER_ID, '편집하는 고래')),
    ),
    http.get(`*/api/v1/members/${ME_ID}`, () => rs(profile(ME_ID, '하늘'))),
  )
}

/** 머리(PageHead)의 버튼 묶음. 내비에도 '출연 모집' 링크가 있어 머리 안에서 찾는다 */
const pageHead = () =>
  screen
    .getByRole('heading', { level: 1, name: '내 출연' })
    .closest('.page-head') as HTMLElement

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('성립한 출연 보기', () => {
  it('보기마다 status를 반복해 요청하고, 보기를 바꾸면 성립한 출연만 첫 페이지로 간다', async () => {
    const lists: URL[] = []
    mockPartner()
    server.use(
      http.get('*/api/v1/appearances/requests/sent', () =>
        rs(pageOf([], { number: 1, totalElements: 21, totalPages: 3 })),
      ),
      http.get('*/api/v1/appearances', ({ request }) => {
        const url = new URL(request.url)
        if (isCount(url)) return rs(pageOf([]))
        lists.push(url)
        const ended = url.searchParams.getAll('status').includes('CONFIRMED')
        return rs(
          pageOf(
            [
              summary({
                status: ended ? 'CONFIRMED' : 'ESTABLISHED',
                title: ended ? '끝난 합방' : '진행 중 합방',
              }),
            ],
            {
              number: Number(url.searchParams.get('page')),
              totalElements: 21,
              totalPages: 3,
            },
          ),
        )
      }),
    )
    const router = renderApp('/appearances?page=2&apage=2', 'INFLUENCER')

    const section = await screen.findByRole('region', { name: '성립한 출연' })
    expect(
      await within(section).findByRole('link', { name: /진행 중 합방/ }),
    ).toBeInTheDocument()
    expect(lists.at(-1)?.searchParams.getAll('status')).toEqual(ONGOING)
    expect(lists.at(-1)?.searchParams.get('role')).toBe('HOST')
    expect(lists.at(-1)?.searchParams.get('page')).toBe('1')

    const select = within(section).getByRole('combobox', {
      name: '성립한 출연 보기',
    })
    expect(select).toHaveValue('ongoing')
    await userEvent.selectOptions(select, '끝난 출연')

    expect(
      await within(section).findByRole('link', { name: /끝난 합방/ }),
    ).toBeInTheDocument()
    expect(lists.at(-1)?.searchParams.getAll('status')).toEqual(ENDED)
    expect(lists.at(-1)?.searchParams.get('page')).toBe('0')
    // 요청 목록 페이지(page)는 그대로 둔다
    expect(router.state.location.search).toBe('?page=2&aview=ended')
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })
})

describe('역할 탭의 응답할 일 개수', () => {
  it('서버 totalElements를 탭 이름과 함께 읽히게 보이고, 0이면 숨긴다', async () => {
    const counts: URL[] = []
    server.use(
      http.get('*/api/v1/appearances/requests/sent', () => rs(pageOf([]))),
      http.get('*/api/v1/appearances/requests/received', ({ request }) => {
        const url = new URL(request.url)
        counts.push(url)
        // 화면이 받은 페이지를 세지 않고 totalElements만 쓰는지 보려고 content는 1건만 준다
        return rs({
          content: [received()],
          page: { size: 1, number: 0, totalElements: 2, totalPages: 2 },
        })
      }),
      http.get('*/api/v1/appearances', ({ request }) => {
        const url = new URL(request.url)
        if (isCount(url)) counts.push(url)
        return rs(pageOf([]))
      }),
    )
    renderApp('/appearances', 'INFLUENCER')

    const guest = await screen.findByRole('tab', {
      name: '게스트로 (받은 요청), 응답 필요 2건',
    })
    expect(within(guest).getByText('2')).toHaveAttribute('aria-hidden', 'true')
    const host = screen.getByRole('tab', { name: '호스트로 (보낸 요청)' })
    expect(host.querySelector('.n')).toBeNull()

    const guestCount = counts.find((u) => u.pathname.endsWith('/received'))
    expect(guestCount?.searchParams.getAll('status')).toEqual(['REQUESTED'])
    expect(guestCount?.searchParams.get('size')).toBe('1')
    const hostCount = counts.find((u) => u.pathname.endsWith('/appearances'))
    expect(hostCount?.searchParams.get('role')).toBe('HOST')
    expect(hostCount?.searchParams.getAll('status')).toEqual([
      'CANCEL_REQUESTED',
    ])
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('받은 요청을 수락하고 돌아오면 게스트 탭 개수가 줄어든다', async () => {
    const current = { value: received() }
    mockPartner()
    server.use(
      http.get('*/api/v1/appearances/requests/received', ({ request }) => {
        const url = new URL(request.url)
        const statuses = url.searchParams.getAll('status')
        const content = [current.value].filter(
          (r) => statuses.length === 0 || statuses.includes(r.status),
        )
        return rs(pageOf(content))
      }),
      http.get('*/api/v1/appearances/requests/30', () => rs(current.value)),
      http.post('*/api/v1/appearances/requests/30/accept', () => {
        current.value = received({
          status: 'ACCEPTED',
          respondedAt: '2026-10-14T12:00:00',
        })
        return rs(current.value)
      }),
    )
    const router = renderApp('/appearances?tab=guest', 'INFLUENCER')

    expect(
      await screen.findByRole('tab', {
        name: '게스트로 (받은 요청), 응답 필요 1건',
      }),
    ).toBeInTheDocument()
    await userEvent.click(
      await screen.findByRole('link', { name: /받은 합방 요청/ }),
    )
    await userEvent.click(await screen.findByRole('button', { name: '수락' }))
    const dialog = await screen.findByRole('dialog', {
      name: '이 조건으로 수락할까요?',
    })
    await userEvent.click(within(dialog).getByRole('button', { name: '수락' }))
    expect(await screen.findByText('출연 성립')).toBeInTheDocument()

    await act(() => router.navigate(-1))
    expect(
      await screen.findByRole('tab', { name: '게스트로 (받은 요청)' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })
})

describe('머리 버튼과 빈 화면', () => {
  it('호스트는 게스트 찾기·출연 모집으로 안내한다', async () => {
    renderApp('/appearances', 'INFLUENCER')

    const section = await screen.findByRole('region', { name: '성립한 출연' })
    expect(
      within(pageHead()).getByRole('link', { name: '출연 모집' }),
    ).toHaveAttribute('href', '/recruits')
    expect(
      await within(section).findByText('아직 성립한 출연이 없어요'),
    ).toBeInTheDocument()
    expect(
      within(section).getByText(
        '인플루언서를 찾아 출연을 요청하거나, 모집글을 올려 게스트를 모아 보세요.',
      ),
    ).toBeInTheDocument()
    expect(
      within(section).getByRole('link', { name: '게스트 찾기' }),
    ).toHaveAttribute('href', '/influencers')
    expect(
      within(section).getByRole('link', { name: '출연 모집' }),
    ).toHaveAttribute('href', '/recruits')
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('게스트는 내 프로필·출연 모집으로 안내하고, 끝난 출연만 있으면 진행 중인 출연이 없다고 한다', async () => {
    server.use(
      http.get('*/api/v1/appearances', ({ request }) => {
        const url = new URL(request.url)
        const ended = url.searchParams.getAll('status').includes('CONFIRMED')
        return rs(
          pageOf(
            ended
              ? [summary({ hostId: PARTNER_ID, guestId: ME_ID })]
              : ([] as AppearanceSummary[]),
          ),
        )
      }),
    )
    renderApp('/appearances?tab=guest', 'INFLUENCER')

    const section = await screen.findByRole('region', { name: '성립한 출연' })
    expect(
      await within(section).findByText('진행 중인 출연이 없어요'),
    ).toBeInTheDocument()
    expect(
      within(section).getByText(
        '프로필을 채워 두면 호스트가 찾기 쉬워요. 열린 모집글에 지원해 볼 수도 있어요.',
      ),
    ).toBeInTheDocument()
    expect(
      within(section).getByRole('link', { name: '내 프로필' }),
    ).toHaveAttribute('href', '/profile/edit')
    expect(
      within(section).getByRole('link', { name: '출연 모집' }),
    ).toHaveAttribute('href', '/recruits')
    expect(
      within(section).queryByRole('link', { name: '게스트 찾기' }),
    ).toBeNull()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('끝난 출연을 못 불러오면 성립한 출연이 없다고 단정하지 않는다', async () => {
    let endedCalls = 0
    server.use(
      http.get('*/api/v1/appearances', ({ request }) => {
        const url = new URL(request.url)
        if (url.searchParams.getAll('status').includes('CONFIRMED')) {
          endedCalls += 1
          return HttpResponse.json(
            { status: 400, code: 'INVALID_REQUEST', detail: '잘못된 요청' },
            { status: 400 },
          )
        }
        return rs(pageOf([] as AppearanceSummary[]))
      }),
    )
    renderApp('/appearances', 'INFLUENCER')

    const section = await screen.findByRole('region', { name: '성립한 출연' })
    expect(
      await within(section).findByText('진행 중인 출연이 없어요'),
    ).toBeInTheDocument()
    expect(endedCalls).toBe(1)
    expect(within(section).queryByText('아직 성립한 출연이 없어요')).toBeNull()
    expect(
      within(section).getByRole('link', { name: '출연 모집' }),
    ).toHaveAttribute('href', '/recruits')
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })
})
