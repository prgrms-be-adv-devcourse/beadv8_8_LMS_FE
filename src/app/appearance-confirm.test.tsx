import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { appearanceQuery } from '@/entities/appearance/api'
import type {
  Appearance,
  AppearanceSummary,
  HpReleaseStatus,
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

/** 지금으로부터 ms 전의 KST LocalDateTime (BE 형식). 확인 기간 안의 방송 예정 일시를 만든다 */
const kstAgo = (ms: number) =>
  new Date(Date.now() + 9 * 3_600_000 - ms).toISOString().slice(0, 19)

/** 확인 기간 안: 한 시간 전에 방송했다 */
const AIRED = kstAgo(3_600_000)

/** 나(ME_ID)는 기본 호스트, 상대(PARTNER_ID)는 게스트. 기본은 방송이 끝나 확인 기간 안이다 */
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
  scheduledAt: AIRED,
  status: 'ESTABLISHED',
  establishedAt: '2026-10-01T10:00:00',
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
  createdAt: '2026-10-01T10:00:00',
  updatedAt: '2026-10-01T10:00:00',
  ...patch,
})

const asGuest = (patch: Partial<Appearance> = {}) =>
  appearance({ hostId: PARTNER_ID, guestId: ME_ID, ...patch })

/** 출연 상세. current.value를 바꾸면 다시 불렀을 때 바뀐 상태가 온다. 상세를 부른 횟수를 센다 */
function mockAppearance(current: { value: Appearance }) {
  const calls = { detail: 0 }
  document.cookie = 'XSRF-TOKEN=t'
  server.use(
    http.get(`*/api/v1/members/${PARTNER_ID}`, () =>
      rs(profile(PARTNER_ID, '편집하는 고래')),
    ),
    http.get(`*/api/v1/members/${ME_ID}`, () => rs(profile(ME_ID, '하늘'))),
    http.get('*/api/v1/appearances/40', () => {
      calls.detail++
      return rs(current.value)
    }),
  )
  return calls
}

/** renderApp이 지갑 응답을 정하므로, 다시 부른 횟수는 그 뒤에 등록해 센다 */
function countWallet() {
  const calls = { wallet: 0 }
  server.use(
    http.get('*/api/v1/wallets/me', () => {
      calls.wallet++
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
  return calls
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

describe('출연 확인·불참 (호스트)', () => {
  it('확인 기간 안의 호스트는 출연을 확인하고, 게스트 지급 진행 상태를 본다', async () => {
    const current = { value: appearance() }
    let token: string | null = null
    mockAppearance(current)
    server.use(
      http.post('*/api/v1/appearances/40/confirm', ({ request }) => {
        token = request.headers.get('X-XSRF-TOKEN')
        current.value = appearance({
          status: 'CONFIRMED',
          confirmType: 'HOST',
          confirmedAt: '2026-10-16T10:00:00',
          hpPayoutStatus: 'PENDING',
        })
        return rs(current.value)
      }),
    )
    renderApp('/appearances/40', 'INFLUENCER')
    const wallet = countWallet()

    expect(await screen.findByText('출연 확인 필요')).toBeInTheDocument()
    expect(
      screen.getByText(/까지 출연 확인이나 불참으로 응답해 주세요/),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '출연 확인' }))
    const dialog = screen.getByRole('dialog', { name: '출연을 확인할까요?' })
    expect(dialog).toHaveTextContent('출연료 25,000 HP가 게스트에게 지급돼요')
    expect(dialog).toHaveTextContent('처리한 뒤에는 바꿀 수 없어요')
    const walletBefore = wallet.wallet
    await userEvent.click(
      within(dialog).getByRole('button', { name: '출연 확인' }),
    )

    expect(
      await screen.findByText(
        '출연을 확인했어요. 게스트에게 25,000 HP가 지급돼요.',
      ),
    ).toBeInTheDocument()
    expect(token).toBe('t')
    expect(await screen.findByText(/· 호스트 확인/)).toBeInTheDocument()
    expect(screen.getByText('출연료 지급을 처리 중이에요.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '불참' })).toBeNull()
    // 지급으로 HP가 움직였으니 지갑을 다시 부른다.
    await waitFor(() => expect(wallet.wallet).toBeGreaterThan(walletBefore))
    await settleDetail()
  })

  it('불참은 사유(선택)를 보내고 출연료 반환 진행 상태를 보여 준다', async () => {
    const current = { value: appearance() }
    const bodies: unknown[] = []
    mockAppearance(current)
    server.use(
      http.post('*/api/v1/appearances/40/absent', async ({ request }) => {
        const body = (await request.json()) as { reason: string | null }
        bodies.push(body)
        current.value = appearance({
          status: 'ABSENT',
          absentAt: '2026-10-16T10:00:00',
          absentReason: body.reason,
          hpReleaseStatus: 'PENDING',
        })
        return rs(current.value)
      }),
    )
    renderApp('/appearances/40', 'INFLUENCER')

    await userEvent.click(await screen.findByRole('button', { name: '불참' }))
    const dialog = screen.getByRole('dialog', {
      name: '불참으로 처리할까요?',
    })
    expect(dialog).toHaveTextContent('출연료 25,000 HP를 돌려받아요')
    expect(dialog).toHaveTextContent('처리한 뒤에는 바꿀 수 없어요')
    await userEvent.type(
      within(dialog).getByLabelText('불참 사유 (선택)'),
      '  연락이 되지 않았어요  ',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: '불참 처리' }),
    )

    expect(
      await screen.findByText(
        '불참으로 처리했어요. 출연료 25,000 HP를 돌려받아요.',
      ),
    ).toBeInTheDocument()
    expect(bodies).toEqual([{ reason: '연락이 되지 않았어요' }])
    expect(await screen.findByText('불참 · HP 반환')).toBeInTheDocument()
    expect(screen.getByText(/사유: 연락이 되지 않았어요/)).toBeInTheDocument()
    expect(screen.getByText('출연료 반환을 처리 중이에요.')).toBeInTheDocument()
    await settleDetail()
  })

  it('불참 사유를 비우면 사유 없이 보낸다', async () => {
    const current = { value: appearance() }
    const bodies: unknown[] = []
    mockAppearance(current)
    server.use(
      http.post('*/api/v1/appearances/40/absent', async ({ request }) => {
        bodies.push(await request.json())
        current.value = appearance({
          status: 'ABSENT',
          absentAt: '2026-10-16T10:00:00',
          hpReleaseStatus: 'DONE',
        })
        return rs(current.value)
      }),
    )
    renderApp('/appearances/40', 'INFLUENCER')

    await userEvent.click(await screen.findByRole('button', { name: '불참' }))
    const dialog = screen.getByRole('dialog', {
      name: '불참으로 처리할까요?',
    })
    await userEvent.click(
      within(dialog).getByRole('button', { name: '불참 처리' }),
    )
    expect(await screen.findByText('불참 · HP 반환')).toBeInTheDocument()
    expect(bodies).toEqual([{ reason: null }])
    await settleDetail()
  })

  it.each([
    [
      '방송 전',
      appearance({ scheduledAt: '2999-10-20T21:00:00' }),
      /방송 예정 일시 전에 취소하면/,
    ],
    [
      '확인 기간이 끝난 뒤',
      appearance({ scheduledAt: '2020-01-01T21:00:00' }),
      /확인 기간이 지나 곧 자동으로 출연이 확인돼요/,
    ],
    [
      '방송 뒤 취소 요청 처리 중',
      appearance({ status: 'CANCEL_REQUESTED' }),
      /취소 요청은 곧 자동 거절되고 출연이 유지돼요. 그 뒤 출연 확인·불참으로 응답할 수 있어요/,
    ],
  ])('%s이면 확인·불참 버튼 없이 안내만 보인다', async (_, value, note) => {
    mockAppearance({ value })
    renderApp('/appearances/40', 'INFLUENCER')
    expect(await screen.findByText(note)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '출연 확인' })).toBeNull()
    expect(screen.queryByRole('button', { name: '불참' })).toBeNull()
    await settleDetail()
  })

  it.each([
    [
      'APPEARANCE_NOT_CONFIRMABLE',
      '이미 응답했거나 취소된 출연이라 처리할 수 없어요. 화면을 새로 불러왔어요.',
    ],
    [
      'APPEARANCE_CONFIRM_NOT_OPEN',
      '방송 예정 일시가 지난 뒤에 응답할 수 있어요.',
    ],
    [
      'APPEARANCE_CONFIRM_PERIOD_ENDED',
      '확인 기간이 지나 곧 자동으로 출연이 확인돼요.',
    ],
  ])(
    '%s 응답이면 안내하고 모달을 닫은 뒤 상세를 다시 불러온다',
    async (code, message) => {
      const calls = mockAppearance({ value: appearance() })
      server.use(
        http.post('*/api/v1/appearances/40/confirm', () => problem(409, code)),
      )
      renderApp('/appearances/40', 'INFLUENCER')

      await userEvent.click(
        await screen.findByRole('button', { name: '출연 확인' }),
      )
      const before = calls.detail
      const dialog = screen.getByRole('dialog', { name: '출연을 확인할까요?' })
      await userEvent.click(
        within(dialog).getByRole('button', { name: '출연 확인' }),
      )

      expect(await screen.findByText(message)).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      await waitFor(() => expect(calls.detail).toBeGreaterThan(before))
      await settleDetail()
    },
  )
})

describe('출연 확인 결과 (게스트·자동 확인)', () => {
  it('게스트는 확인 기한 안내만 보고 버튼이 없다', async () => {
    mockAppearance({ value: asGuest() })
    renderApp('/appearances/40', 'INFLUENCER')
    expect(await screen.findByText('확인 대기')).toBeInTheDocument()
    expect(
      screen.getByText(/호스트가 출연을 확인하거나 .+에 자동 확인되면/),
    ).toBeInTheDocument()
    for (const name of ['출연 확인', '불참', '출연 취소 요청'])
      expect(screen.queryByRole('button', { name })).toBeNull()
    await settleDetail()
  })

  it('불참 처리된 게스트는 사유와 고객센터 문의 안내를 본다', async () => {
    mockAppearance({
      value: asGuest({
        status: 'ABSENT',
        absentAt: '2026-10-16T10:00:00',
        absentReason: '연락이 되지 않았어요',
        hpReleaseStatus: 'DONE',
      }),
    })
    renderApp('/appearances/40', 'INFLUENCER')
    expect(
      await screen.findByText(/사유: 연락이 되지 않았어요/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '고객센터 문의' })).toHaveAttribute(
      'href',
      '/support',
    )
    // 반환은 호스트의 HP라 게스트에게는 진행 상태를 보이지 않는다.
    expect(screen.queryByText(/출연료 반환을/)).toBeNull()
    await settleDetail()
  })

  it('자동 확인된 출연은 자동 확인으로 표시하고 지급 실패를 알린다', async () => {
    mockAppearance({
      value: asGuest({
        status: 'CONFIRMED',
        scheduledAt: '2026-10-01T21:00:00',
        confirmType: 'AUTO',
        confirmedAt: '2026-10-08T21:00:50',
        hpPayoutStatus: 'DEAD',
      }),
    })
    renderApp('/appearances/40', 'INFLUENCER')
    expect(await screen.findByText(/· 자동 확인/)).toBeInTheDocument()
    expect(
      screen.getByText(/확인 기간이 지나 자동으로 출연이 확인됐어요/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        '출연료 지급을 처리하지 못했어요. 고객센터로 문의해 주세요.',
      ),
    ).toBeInTheDocument()
    await settleDetail()
  })
})

describe('HP 처리 안내', () => {
  const cases = [
    {
      label: '출연료 지급을',
      value: (s: HpReleaseStatus) =>
        appearance({
          status: 'CONFIRMED',
          confirmType: 'HOST',
          hpPayoutStatus: s,
        }),
    },
    {
      label: '출연료 반환을',
      value: (s: HpReleaseStatus) =>
        appearance({ status: 'ABSENT', hpReleaseStatus: s }),
    },
    {
      label: '위약금 정산을',
      value: (s: HpReleaseStatus) =>
        appearance({ status: 'CANCELED_BY_HOST', hpPenaltyStatus: s }),
    },
  ]
  const notes: [HpReleaseStatus, string][] = [
    ['PENDING', '처리 중이에요.'],
    ['DONE', '마쳤어요.'],
    ['DEAD', '처리하지 못했어요. 고객센터로 문의해 주세요.'],
  ]

  it.each(
    cases.flatMap(({ label, value }) =>
      notes.map(([status, note]) => ({
        label,
        status,
        value: value(status),
        text: `${label} ${note}`,
      })),
    ),
  )(
    '$label $status 상태면 "$text"를 보여 준다',
    async ({ status, value, text }) => {
      mockAppearance({ value })
      renderApp('/appearances/40', 'INFLUENCER')
      const note = await screen.findByText(text)
      // 실패만 경고색으로 보인다.
      if (status === 'DEAD') expect(note).toHaveClass('c-bad')
      else expect(note).not.toHaveClass('c-bad')
      await settleDetail()
    },
  )
})

describe('내 출연 목록의 확인 대기', () => {
  function mockList(content: AppearanceSummary[]) {
    server.use(
      http.get(`*/api/v1/members/${PARTNER_ID}`, () =>
        rs(profile(PARTNER_ID, '편집하는 고래')),
      ),
      http.get('*/api/v1/appearances/requests/sent', () => rs(page([]))),
      http.get('*/api/v1/appearances/requests/received', () => rs(page([]))),
      http.get('*/api/v1/appearances', () => rs(page(content))),
    )
  }

  it('호스트에게는 확인 기간 안의 출연을 출연 확인 필요로 보여 준다', async () => {
    mockList([
      summary(),
      summary({ id: 41, scheduledAt: '2999-10-20T21:00:00' }),
    ])
    renderApp('/appearances', 'INFLUENCER')
    const section = await screen.findByRole('region', { name: '성립한 출연' })
    const cards = await within(section).findAllByRole('link')
    expect(within(cards[0]).getByText('출연 확인 필요')).toBeInTheDocument()
    expect(within(cards[1]).getByText('출연 성립')).toBeInTheDocument()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('게스트에게는 확인 대기로 보여 준다', async () => {
    mockList([summary({ hostId: PARTNER_ID, guestId: ME_ID })])
    renderApp('/appearances?tab=guest', 'INFLUENCER')
    const section = await screen.findByRole('region', { name: '성립한 출연' })
    const card = await within(section).findByRole('link', {
      name: /주말 게임 합방/,
    })
    expect(within(card).getByText('확인 대기')).toBeInTheDocument()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })
})
