import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { appearanceQuery, recruitQuery } from '@/entities/appearance/api'
import type {
  Appearance,
  AppearanceCancelRequest,
  AppearanceSummary,
  Recruit,
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

const page = <T,>(content: T[]) => ({
  content,
  page: { size: 10, number: 0, totalElements: content.length, totalPages: 1 },
})

const problem = (status: number, code: string, detail = code) =>
  HttpResponse.json({ status, code, detail }, { status })

/** 나(ME_ID)는 기본 호스트, 상대(PARTNER_ID)는 게스트 */
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

const appearance = (patch: Partial<Appearance> = {}): Appearance => ({
  ...summary(),
  applicationId: null,
  canceledAt: null,
  cancelRequests: [],
  hpReleaseStatus: null,
  penaltyAmount: null,
  hostCancelReason: null,
  hpPenaltyStatus: null,
  confirmType: null,
  confirmedAt: null,
  absentAt: null,
  absentReason: null,
  hpPayoutStatus: null,
  version: 0,
  createdAt: '2026-10-14T10:00:00',
  updatedAt: '2026-10-14T10:00:00',
  ...patch,
})

const cancelRequest = (
  patch: Partial<AppearanceCancelRequest> = {},
): AppearanceCancelRequest => ({
  id: 1,
  sequence: 1,
  reason: '학교 행사와 겹쳤어요',
  status: 'REQUESTED',
  rejectReason: null,
  requestedAt: '2026-10-15T09:00:00',
  respondedAt: null,
  ...patch,
})

/** 출연 상세. current.value를 바꾸면 다시 불렀을 때 바뀐 상태가 온다 */
function mockAppearance(current: { value: Appearance }) {
  document.cookie = 'XSRF-TOKEN=t'
  server.use(
    http.get(`*/api/v1/members/${PARTNER_ID}`, () =>
      rs(profile(PARTNER_ID, '편집하는 고래')),
    ),
    http.get(`*/api/v1/members/${ME_ID}`, () => rs(profile(ME_ID, '하늘'))),
    http.get('*/api/v1/appearances/40', () => rs(current.value)),
  )
}

/** 처리 뒤 상세를 다시 불러온 것까지 끝나야 다음 테스트로 요청이 새지 않는다(#84·#86 격리 규칙) */
async function settleDetail() {
  await waitFor(() =>
    expect(
      queryClient.getQueryState(appearanceQuery(40).queryKey)?.status,
    ).toBe('success'),
  )
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))
}

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('내 출연 목록', () => {
  it('성립한 출연을 역할별로 보여 주고 카드로 출연 상세에 들어간다', async () => {
    const roles: string[] = []
    server.use(
      http.get(`*/api/v1/members/${PARTNER_ID}`, () =>
        rs(profile(PARTNER_ID, '편집하는 고래')),
      ),
      http.get('*/api/v1/appearances/requests/sent', () => rs(page([]))),
      http.get('*/api/v1/appearances', ({ request }) => {
        roles.push(new URL(request.url).searchParams.get('role') ?? '')
        return rs(page([summary({ status: 'CANCEL_REQUESTED' })]))
      }),
    )
    renderApp('/appearances', 'INFLUENCER')

    const section = await screen.findByRole('region', { name: '성립한 출연' })
    const card = await within(section).findByRole('link', {
      name: /주말 게임 합방/,
    })
    expect(card).toHaveAttribute('href', '/appearances/40')
    expect(within(card).getByText('취소 요청 처리 중')).toBeInTheDocument()
    expect(roles).toContain('HOST')
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('두 목록의 URL 페이지가 마지막 페이지를 넘으면 역할 탭을 두고 각각 마지막 페이지로 옮긴다', async () => {
    // Spring Page는 범위를 넘는 페이지에 빈 content와 실제 totalPages를 준다.
    // 두 목록의 범위 밖 응답을 함께 풀어, 두 보정이 같은 때 일어나도 한쪽이 다른 쪽을 덮어쓰지 않는지 본다.
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let held = 0
    const pageOf = async <T,>(request: Request, item: (p: number) => T) => {
      const p = Number(new URL(request.url).searchParams.get('page'))
      if (p >= 2) {
        held++
        await gate
      }
      return rs({
        content: p < 2 ? [item(p)] : [],
        page: { size: 10, number: p, totalElements: 11, totalPages: 2 },
      })
    }
    server.use(
      http.get(`*/api/v1/members/${PARTNER_ID}`, () =>
        rs(profile(PARTNER_ID, '편집하는 고래')),
      ),
      http.get('*/api/v1/appearances/requests/received', ({ request }) =>
        pageOf(request, (p) => ({
          id: 30 + p,
          hostId: PARTNER_ID,
          guestId: ME_ID,
          title: `받은 요청 ${p + 1}`,
          scheduledAt: '2999-10-20T21:00:00',
          fee: 25000,
          acceptDeadline: '2999-10-18T23:59:00',
          status: 'REQUESTED',
          createdAt: '2026-10-14T10:00:00',
        })),
      ),
      http.get('*/api/v1/appearances', ({ request }) =>
        pageOf(request, (p) =>
          summary({
            id: 40 + p,
            hostId: PARTNER_ID,
            guestId: ME_ID,
            title: `성립한 출연 ${p + 1}`,
          }),
        ),
      ),
    )
    const router = renderApp(
      '/appearances?tab=guest&page=9&apage=9',
      'INFLUENCER',
    )
    await waitFor(() => expect(held).toBe(2))
    release()

    const section = await screen.findByRole('region', { name: '성립한 출연' })
    expect(
      await within(section).findByRole('link', { name: /성립한 출연 2/ }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: /받은 요청 2/ }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(router.state.location.search).toBe('?tab=guest&page=2&apage=2'),
    )
    expect(
      screen.queryByText('아직 받은 출연 요청이 없어요'),
    ).not.toBeInTheDocument()
    expect(
      within(section).queryByText('아직 성립한 출연이 없어요.'),
    ).not.toBeInTheDocument()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })
})

describe('출연 취소 (게스트)', () => {
  const asGuest = (patch: Partial<Appearance> = {}) =>
    appearance({ hostId: PARTNER_ID, guestId: ME_ID, ...patch })

  it('방송 전 성립한 출연은 사유를 적어 취소를 요청하고, 처리 중으로 바뀐다', async () => {
    const current = { value: asGuest() }
    let body: unknown
    mockAppearance(current)
    server.use(
      http.post(
        '*/api/v1/appearances/40/cancel-requests',
        async ({ request }) => {
          body = await request.json()
          current.value = asGuest({
            status: 'CANCEL_REQUESTED',
            cancelRequests: [cancelRequest({ reason: '학교 행사와 겹쳤어요' })],
          })
          return rs(current.value)
        },
      ),
    )
    renderApp('/appearances/40', 'INFLUENCER')

    await userEvent.click(
      await screen.findByRole('button', { name: '출연 취소 요청' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: '출연 취소를 요청할까요?',
    })
    const send = within(dialog).getByRole('button', { name: '요청 보내기' })
    expect(send).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('취소 사유'), '  ')
    expect(send).toBeDisabled()
    await userEvent.type(
      within(dialog).getByLabelText('취소 사유'),
      '학교 행사와 겹쳤어요',
    )
    await userEvent.click(send)

    await waitFor(() =>
      expect(body).toEqual({ reason: '학교 행사와 겹쳤어요' }),
    )
    expect(await screen.findByText('취소 요청 처리 중')).toBeInTheDocument()
    const history = screen.getByRole('list', { name: '출연 취소 요청 이력' })
    expect(
      within(history).getByText('사유: 학교 행사와 겹쳤어요'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '출연 취소 요청' })).toBeNull()
    await settleDetail()
  })

  it('방송 예정 일시가 지났거나 2번 요청했으면 요청 버튼이 없다', async () => {
    const current = {
      value: asGuest({ scheduledAt: '2020-01-01T21:00:00' }),
    }
    mockAppearance(current)
    renderApp('/appearances/40', 'INFLUENCER')
    expect(
      await screen.findByText(/방송 예정 일시가 지났어요/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '출연 취소 요청' })).toBeNull()
    await settleDetail()
  })

  it('요청 2번을 다 썼으면 안내만 보인다', async () => {
    const current = {
      value: asGuest({
        cancelRequests: [
          cancelRequest({ id: 1, sequence: 1, status: 'REJECTED' }),
          cancelRequest({ id: 2, sequence: 2, status: 'AUTO_REJECTED' }),
        ],
      }),
    }
    mockAppearance(current)
    renderApp('/appearances/40', 'INFLUENCER')
    expect(
      await screen.findByText('출연 취소 요청은 2번까지 보낼 수 있어요.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '출연 취소 요청' })).toBeNull()
    expect(screen.getByText('응답 없어 자동 거절')).toBeInTheDocument()
    await settleDetail()
  })

  it('요청이 막히면 오류 코드에 맞는 안내를 보여 준다', async () => {
    mockAppearance({ value: asGuest() })
    server.use(
      http.post('*/api/v1/appearances/40/cancel-requests', () =>
        problem(409, 'APPEARANCE_SCHEDULE_PASSED'),
      ),
    )
    renderApp('/appearances/40', 'INFLUENCER')
    await userEvent.click(
      await screen.findByRole('button', { name: '출연 취소 요청' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: '출연 취소를 요청할까요?',
    })
    await userEvent.type(
      within(dialog).getByLabelText('취소 사유'),
      '사정이 생겼어요',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: '요청 보내기' }),
    )
    expect(
      await screen.findByText('방송 예정 일시가 지나 취소할 수 없어요.'),
    ).toBeInTheDocument()
    await settleDetail()
  })
})

describe('출연 취소 (호스트)', () => {
  it('처리 중인 취소 요청을 수락하면 합의 취소된다', async () => {
    const current = {
      value: appearance({
        status: 'CANCEL_REQUESTED',
        cancelRequests: [cancelRequest()],
      }),
    }
    let accepted = false
    mockAppearance(current)
    server.use(
      http.post('*/api/v1/appearances/40/cancel-requests/accept', () => {
        accepted = true
        current.value = appearance({
          status: 'CANCELED_BY_AGREEMENT',
          canceledAt: '2026-10-16T10:00:00',
          cancelRequests: [cancelRequest({ status: 'ACCEPTED' })],
        })
        return rs(current.value)
      }),
    )
    renderApp('/appearances/40', 'INFLUENCER')

    await userEvent.click(
      await screen.findByRole('button', { name: '취소 요청 수락' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: '취소 요청을 수락할까요?',
    })
    await userEvent.click(within(dialog).getByRole('button', { name: '수락' }))

    expect(await screen.findByText('합의 취소 · HP 반환')).toBeInTheDocument()
    expect(accepted).toBe(true)
    expect(screen.queryByRole('button', { name: /출연 취소/ })).toBeNull()
    await settleDetail()
  })

  it('취소 요청을 거절하면 사유(선택)를 보내고 출연이 유지된다', async () => {
    const current = {
      value: appearance({
        status: 'CANCEL_REQUESTED',
        cancelRequests: [cancelRequest()],
      }),
    }
    let body: unknown
    mockAppearance(current)
    server.use(
      http.post(
        '*/api/v1/appearances/40/cancel-requests/reject',
        async ({ request }) => {
          body = await request.json()
          current.value = appearance({
            cancelRequests: [
              cancelRequest({
                status: 'REJECTED',
                rejectReason: '홍보 중이에요',
              }),
            ],
          })
          return rs(current.value)
        },
      ),
    )
    renderApp('/appearances/40', 'INFLUENCER')

    await userEvent.click(
      await screen.findByRole('button', { name: '취소 요청 거절' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: '취소 요청을 거절할까요?',
    })
    await userEvent.type(
      within(dialog).getByLabelText('거절 사유 (선택)'),
      '홍보 중이에요',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: '거절' }))

    await waitFor(() => expect(body).toEqual({ reason: '홍보 중이에요' }))
    expect(await screen.findByText('출연 성립')).toBeInTheDocument()
    expect(screen.getByText('거절 사유: 홍보 중이에요')).toBeInTheDocument()
    await settleDetail()
  })

  it('일방 취소는 위약금 30%를 안내하고, 처리 중인 취소 요청이 있으면 확인 뒤 다시 보낸다', async () => {
    const current = {
      value: appearance({
        status: 'CANCEL_REQUESTED',
        cancelRequests: [cancelRequest()],
      }),
    }
    const bodies: unknown[] = []
    let walletCalls = 0
    mockAppearance(current)
    server.use(
      http.post('*/api/v1/appearances/40/host-cancel', async ({ request }) => {
        const body = (await request.json()) as {
          confirmPendingCancelRequest?: boolean
        }
        bodies.push(body)
        if (!body.confirmPendingCancelRequest)
          return problem(409, 'CANCEL_REQUEST_CONFIRM_REQUIRED')
        current.value = appearance({
          status: 'CANCELED_BY_HOST',
          canceledAt: '2026-10-16T10:00:00',
          penaltyAmount: 7500,
          hostCancelReason: '방송이 취소됐어요',
          hpPenaltyStatus: 'PENDING',
          cancelRequests: [cancelRequest({ status: 'CLOSED_BY_HOST_CANCEL' })],
        })
        return rs(current.value)
      }),
    )
    renderApp('/appearances/40', 'INFLUENCER')
    // renderApp이 지갑 응답을 정하므로, 다시 부른 횟수는 그 뒤에 등록해 센다.
    server.use(
      http.get('*/api/v1/wallets/me', () => {
        walletCalls++
        return rs({
          walletId: 1,
          chargeBalanceHp: 120000,
          revenueBalanceHp: 0,
          heldChargeHp: 0,
          heldRevenueHp: 0,
          availableTotalHp: 120000,
          heldTotalHp: 0,
        })
      }),
    )

    await userEvent.click(
      await screen.findByRole('button', { name: '출연 취소 (위약금 30%)' }),
    )
    const dialog = screen.getByRole('dialog', { name: '출연을 취소할까요?' })
    // 출연료 25,000 → 위약금 7,500 / 돌려받는 HP 17,500
    expect(within(dialog).getByText('−7,500')).toBeInTheDocument()
    expect(within(dialog).getByText('17,500')).toBeInTheDocument()
    await userEvent.type(
      within(dialog).getByLabelText('취소 사유 (선택)'),
      '방송이 취소됐어요',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: '위약금 내고 취소' }),
    )

    // 처리 중인 게스트 요청이 있어 확인을 받는다(안내 토스트 없이 모달이 확인 단계로).
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '게스트가 보낸 출연 취소 요청이 처리 중이에요',
    )
    expect(screen.queryByText('CANCEL_REQUEST_CONFIRM_REQUIRED')).toBeNull()
    const walletBefore = walletCalls
    await userEvent.click(
      within(dialog).getByRole('button', { name: '그래도 위약금 내고 취소' }),
    )

    expect(
      await screen.findByText(
        '출연을 취소했어요. 위약금 7,500 HP가 게스트에게 지급돼요.',
      ),
    ).toBeInTheDocument()
    expect(bodies).toEqual([
      { reason: '방송이 취소됐어요' },
      { reason: '방송이 취소됐어요', confirmPendingCancelRequest: true },
    ])
    expect(
      await screen.findByText('호스트 취소 · 위약금 지급'),
    ).toBeInTheDocument()
    expect(screen.getByText('위약금 정산을 처리 중이에요.')).toBeInTheDocument()
    expect(screen.getByText('호스트 취소로 종료')).toBeInTheDocument()
    // 위약금·반환으로 HP가 움직였으니 지갑을 다시 부른다.
    await waitFor(() => expect(walletCalls).toBeGreaterThan(walletBefore))
    await settleDetail()
  })

  it('확인·불참으로 끝난 출연은 상태만 보이고 취소 버튼이 없다', async () => {
    mockAppearance({
      value: appearance({
        status: 'CONFIRMED',
        scheduledAt: '2020-01-01T21:00:00',
        confirmType: 'AUTO',
        confirmedAt: '2020-01-08T21:00:00',
        hpPayoutStatus: 'DONE',
      }),
    })
    renderApp('/appearances/40', 'INFLUENCER')
    expect(await screen.findByText('출연 확인')).toBeInTheDocument()
    expect(
      screen.getByText(/확인 기간이 지나 자동으로 출연이 확인됐어요/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /취소/ })).toBeNull()
    await settleDetail()
  })
})

describe('모집 전체 취소 (호스트)', () => {
  const recruit = (patch: Partial<Recruit> = {}): Recruit => ({
    id: 7,
    hostId: ME_ID,
    title: '주말 게임 합방 게스트 모집',
    scheduledAt: '2999-10-20T21:00:00',
    feePerPerson: 30000,
    recruitCount: 3,
    selectedCount: 2,
    applicantCount: 4,
    recruitDeadline: '2999-10-18T23:59:00',
    status: 'RECRUITING',
    createdAt: '2026-10-14T10:00:00',
    hostChannelUrl: 'https://chzzk.naver.com/host',
    expectedMinutes: 90,
    content: '공포 게임 3인 플레이',
    closeType: null,
    closedAt: null,
    canceledAt: null,
    hpReleaseStatus: null,
    myApplication: null,
    version: 0,
    updatedAt: '2026-10-14T10:00:00',
    ...patch,
  })

  it('성립 출연 위약금과 대기 지원 미선정을 안내하고, 확인이 필요하면 다시 보낸다', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    const current = { value: recruit() }
    const bodies: unknown[] = []
    server.use(
      http.get(`*/api/v1/members/${ME_ID}`, () => rs(profile(ME_ID, '하늘'))),
      http.get('*/api/v1/appearances/recruits/7', () => rs(current.value)),
      http.get('*/api/v1/appearances/recruits/7/applications', () =>
        rs(page([])),
      ),
      http.post(
        '*/api/v1/appearances/recruits/7/cancel',
        async ({ request }) => {
          const body = (await request.json()) as {
            confirmPendingCancelRequest?: boolean
          }
          bodies.push(body)
          if (!body.confirmPendingCancelRequest)
            return problem(409, 'CANCEL_REQUEST_CONFIRM_REQUIRED')
          current.value = recruit({
            status: 'CANCELED',
            canceledAt: '2026-10-16T10:00:00',
            hpReleaseStatus: 'PENDING',
          })
          return rs(current.value)
        },
      ),
    )
    renderApp('/recruits/7', 'INFLUENCER')

    await userEvent.click(
      await screen.findByRole('button', { name: '모집 전체 취소' }),
    )
    const dialog = screen.getByRole('dialog', { name: '모집을 취소할까요?' })
    // 1인 출연료 30,000의 30% = 9,000. 일방 취소한 출연도 성립 인원에 남아 있어(BE)
    // 합계는 확정하지 않고 성립 인원 기준 상한으로 안내한다.
    expect(within(dialog).getByText('9,000')).toBeInTheDocument()
    expect(within(dialog).getByText('성립 2명 기준 최대')).toBeInTheDocument()
    expect(within(dialog).getByText('−18,000')).toBeInTheDocument()
    expect(
      within(dialog).getByText(/이미 취소한 출연은 빠져요/),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/대기 중인 지원은 모두 미선정/),
    ).toBeInTheDocument()
    await userEvent.click(
      within(dialog).getByRole('button', { name: '모집 취소' }),
    )

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    await userEvent.click(
      within(dialog).getByRole('button', { name: '그래도 모집 취소' }),
    )

    expect(await screen.findByText('모집이 취소됐어요.')).toBeInTheDocument()
    expect(bodies).toEqual([
      { reason: null },
      { reason: null, confirmPendingCancelRequest: true },
    ])
    expect(screen.queryByRole('button', { name: '모집 전체 취소' })).toBeNull()
    await waitFor(() =>
      expect(queryClient.getQueryState(recruitQuery(7).queryKey)?.status).toBe(
        'success',
      ),
    )
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('모집글을 취소할 수 없으면 안내한다', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    server.use(
      http.get(`*/api/v1/members/${ME_ID}`, () => rs(profile(ME_ID, '하늘'))),
      http.get('*/api/v1/appearances/recruits/7', () =>
        rs(recruit({ selectedCount: 0 })),
      ),
      http.get('*/api/v1/appearances/recruits/7/applications', () =>
        rs(page([])),
      ),
      http.post('*/api/v1/appearances/recruits/7/cancel', () =>
        problem(409, 'APPEARANCE_RECRUIT_NOT_CANCELABLE'),
      ),
    )
    renderApp('/recruits/7', 'INFLUENCER')
    await userEvent.click(
      await screen.findByRole('button', { name: '모집 전체 취소' }),
    )
    const dialog = screen.getByRole('dialog', { name: '모집을 취소할까요?' })
    expect(
      within(dialog).getByText(/위약금 없이 보류된 HP를 모두 돌려받아요/),
    ).toBeInTheDocument()
    await userEvent.click(
      within(dialog).getByRole('button', { name: '모집 취소' }),
    )
    expect(
      await screen.findByText(
        '모집 중이거나 마감된 모집글만 취소할 수 있어요.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
  })
})
