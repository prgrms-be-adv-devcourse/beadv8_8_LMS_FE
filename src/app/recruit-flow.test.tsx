import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type {
  Application,
  Recruit,
  RecruitSummary,
} from '@/entities/appearance/types'
import { kstLocalInput } from '@/shared/lib/date'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const HOST_ID = 9
const GUEST_ID = 8

const profile = (id: number, nickname: string) => ({
  id,
  nickname,
  role: 'INFLUENCER',
  profileImageUrl: null,
  channels: [],
})

const page = <T,>(content: T[], number = 0, totalPages = 1) => ({
  content,
  page: { size: 10, number, totalElements: content.length, totalPages },
})

const summary = (patch: Partial<RecruitSummary> = {}): RecruitSummary => ({
  id: 7,
  hostId: HOST_ID,
  title: '주말 게임 합방 게스트 모집',
  scheduledAt: '2999-10-20T21:00:00',
  feePerPerson: 30000,
  recruitCount: 3,
  selectedCount: 1,
  applicantCount: 4,
  recruitDeadline: '2999-10-18T23:59:00',
  status: 'RECRUITING',
  createdAt: '2026-10-14T10:00:00',
  ...patch,
})

const recruit = (patch: Partial<Recruit> = {}): Recruit => ({
  ...summary(),
  hostChannelUrl: 'https://chzzk.naver.com/host',
  expectedMinutes: 90,
  content: '공포 게임 3인 플레이',
  closeType: null,
  closedAt: null,
  canceledAt: null,
  hpReleaseStatus: null,
  version: 0,
  updatedAt: '2026-10-14T10:00:00',
  ...patch,
})

const application = (patch: Partial<Application> = {}): Application => ({
  id: 50,
  recruitId: 7,
  guestId: ME_ID,
  message: '같은 장르로 방송해요',
  status: 'APPLIED',
  respondedAt: null,
  withdrawnAt: null,
  appearanceId: null,
  createdAt: '2026-10-15T09:00:00',
  ...patch,
})

const problem = (status: number, code: string, detail = code) =>
  HttpResponse.json({ status, code, detail }, { status })

function mockProfiles() {
  server.use(
    http.get(`*/api/v1/members/${HOST_ID}`, () =>
      rs(profile(HOST_ID, '밤새는곰')),
    ),
    http.get(`*/api/v1/members/${GUEST_ID}`, () =>
      rs(profile(GUEST_ID, '편집하는 고래')),
    ),
    http.get(`*/api/v1/members/${ME_ID}`, () => rs(profile(ME_ID, '하늘'))),
  )
}

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('출연 모집 목록', () => {
  it('모집 중 탭은 카드에 제목·호스트·방송·마감·지원자 수·1인 출연료·자리를 보여 준다', async () => {
    mockProfiles()
    server.use(
      http.get('*/api/v1/appearances/recruits', () => rs(page([summary()]))),
    )
    renderApp('/recruits', 'INFLUENCER')

    const card = await screen.findByRole('link', {
      name: /주말 게임 합방 게스트 모집/,
    })
    expect(card).toHaveAttribute('href', '/recruits/7')
    expect(await within(card).findByText('밤새는곰')).toBeInTheDocument()
    expect(within(card).getByText(/방송 10\/20\(.\) 21:00/)).toBeInTheDocument()
    expect(within(card).getByText(/마감 10\/18\(.\) 23:59/)).toBeInTheDocument()
    expect(within(card).getByText('지원 4명')).toBeInTheDocument()
    expect(within(card).getByText('30,000 HP')).toBeInTheDocument()
    expect(
      within(card).getByRole('img', { name: '성립 1명 / 모집 3명' }),
    ).toBeInTheDocument()
  })

  it('마감이 3일 이하로 남으면 마감 D-n을 signal로 표시한다', async () => {
    mockProfiles()
    const soon = `${kstLocalInput(2, '23:59')}:00`
    server.use(
      http.get('*/api/v1/appearances/recruits', () =>
        rs(page([summary({ recruitDeadline: soon })])),
      ),
    )
    renderApp('/recruits', 'INFLUENCER')

    expect(await screen.findByText('마감 D-2')).toHaveClass('pill', 'signal')
  })

  it('내 모집글·내 지원 탭은 인플루언서에게만 보이고 URL tab으로 바뀐다', async () => {
    mockProfiles()
    server.use(
      http.get('*/api/v1/appearances/recruits', () => rs(page([summary()]))),
      http.get('*/api/v1/appearances/recruits/mine', () =>
        rs(page([summary({ id: 8, hostId: ME_ID, title: '내가 올린 모집' })])),
      ),
    )
    const router = renderApp('/recruits', 'INFLUENCER')

    await userEvent.click(await screen.findByRole('tab', { name: '내 모집글' }))
    const card = await screen.findByRole('link', { name: /내가 올린 모집/ })
    expect(within(card).getByText('내 모집')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?tab=mine')
    expect(screen.getByRole('tab', { name: '내 모집글' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('유저에게는 탭과 모집글 올리기 버튼이 없다', async () => {
    mockProfiles()
    server.use(
      http.get('*/api/v1/appearances/recruits', () => rs(page([summary()]))),
    )
    renderApp('/recruits', 'USER')

    expect(
      await screen.findByRole('link', { name: /주말 게임 합방 게스트 모집/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '내 모집글' })).toBeNull()
    expect(screen.queryByRole('button', { name: '모집글 올리기' })).toBeNull()
  })

  it('내 지원 탭은 모집글 링크·지원 상태·지원일을 보여 준다', async () => {
    server.use(
      http.get('*/api/v1/appearances/applications/mine', () =>
        rs(
          page([
            application(),
            application({ id: 51, recruitId: 9, status: 'SELECTED' }),
          ]),
        ),
      ),
    )
    renderApp('/recruits?tab=applications', 'INFLUENCER')

    const first = (
      await screen.findByRole('link', { name: '모집글 #7' })
    ).closest('.row-item') as HTMLElement
    expect(first.querySelector('a')).toHaveAttribute('href', '/recruits/7')
    expect(within(first).getByText('대기')).toHaveClass('pill', 'info')
    expect(
      within(first).getByText(/10\/15\(.\) 09:00 지원/),
    ).toBeInTheDocument()
    const second = screen
      .getByRole('link', { name: '모집글 #9' })
      .closest('.row-item') as HTMLElement
    expect(within(second).getByText('출연 성립')).toHaveClass('pill', 'ok')
  })

  it('목록이 비면 빈 상태를 보여 준다', async () => {
    server.use(
      http.get('*/api/v1/appearances/recruits', () => rs(page([], 0, 0))),
    )
    renderApp('/recruits', 'INFLUENCER')

    expect(
      await screen.findByText('지금 모집 중인 글이 없어요'),
    ).toBeInTheDocument()
  })

  it('비회원이 /recruits에 오면 로그인 안내를 보여 준다', async () => {
    renderApp('/recruits', 'GUEST')
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
  })

  it('페이지를 넘기면 URL page가 바뀐다', async () => {
    mockProfiles()
    const pages: string[] = []
    server.use(
      http.get('*/api/v1/appearances/recruits', ({ request }) => {
        const p = Number(new URL(request.url).searchParams.get('page'))
        pages.push(String(p))
        return rs(page([summary({ id: 7 + p, title: `모집 ${p}` })], p, 2))
      }),
    )
    const router = renderApp('/recruits', 'INFLUENCER')

    expect(await screen.findByText('모집 0')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByText('모집 1')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toBe('?page=2'))
    expect(pages).toEqual(['0', '1'])
  })
})

/** 모집 목록 + 승인된 내 채널. 모집글 올리기 모달을 연다 */
async function openRecruitForm(wallet = {}) {
  server.use(
    http.get('*/api/v1/appearances/recruits', () => rs(page([], 0, 0))),
    http.get('*/api/v1/appearances/recruits/mine', () => rs(page([], 0, 0))),
    http.get('*/api/v1/members/channels/me', () =>
      rs([
        {
          id: 1,
          platform: 'CHZZK',
          channelName: '하늘 채널',
          channelUrl: 'https://chzzk.naver.com/sky',
          followerCount: 50,
          followerCountAt: null,
          status: 'APPROVED',
          rejectionReason: null,
          requestedAt: null,
        },
      ]),
    ),
  )
  document.cookie = 'XSRF-TOKEN=t'
  const router = renderApp('/recruits', 'INFLUENCER', wallet)
  await userEvent.click(
    await screen.findByRole('button', { name: '모집글 올리기' }),
  )
  const dialog = await screen.findByRole('dialog', { name: '모집글 올리기' })
  return { router, dialog }
}

async function fillRecruitForm(dialog: HTMLElement) {
  await userEvent.type(
    within(dialog).getByLabelText('제목'),
    '주말 게임 합방 게스트 모집',
  )
  await userEvent.type(
    within(dialog).getByLabelText('콘텐츠 설명'),
    '공포 게임 3인 플레이',
  )
  const fee = within(dialog).getByLabelText('1인 출연료 (HP)')
  await userEvent.clear(fee)
  await userEvent.type(fee, '30000')
  const count = within(dialog).getByLabelText('모집 인원')
  await userEvent.clear(count)
  await userEvent.type(count, '3')
}

describe('모집글 올리기', () => {
  it('입력을 검사하고 보류할 HP(출연료 × 인원)를 보여 준다', async () => {
    let posts = 0
    server.use(
      http.post('*/api/v1/appearances/recruits', () => {
        posts++
        return rs(recruit(), 201)
      }),
    )
    const { dialog } = await openRecruitForm()

    const fee = within(dialog).getByLabelText('1인 출연료 (HP)')
    await userEvent.clear(fee)
    await userEvent.type(fee, '30000')
    const count = within(dialog).getByLabelText('모집 인원')
    await userEvent.clear(count)
    await userEvent.type(count, '3')
    expect(
      within(dialog).getByText('보류할 HP (30,000 × 3명)'),
    ).toBeInTheDocument()
    await userEvent.click(
      await within(dialog).findByRole('button', {
        name: '90,000 HP 보류하고 게시',
      }),
    )

    expect(
      await within(dialog).findByText('제목을 입력해 주세요.'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('콘텐츠 설명을 입력해 주세요.'),
    ).toBeInTheDocument()
    await userEvent.clear(count)
    await userEvent.type(count, '11')
    expect(
      within(dialog).getByText('모집 인원은 1~10명이에요.'),
    ).toBeInTheDocument()
    expect(posts).toBe(0)
  })

  it('올리면 입력을 보내고 상세로 간다', async () => {
    let body: Record<string, unknown> | undefined
    server.use(
      http.post('*/api/v1/appearances/recruits', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return rs(recruit({ hostId: ME_ID }), 201)
      }),
      http.get('*/api/v1/appearances/recruits/7', () =>
        rs(recruit({ hostId: ME_ID })),
      ),
      http.get('*/api/v1/appearances/recruits/7/applications', () =>
        rs(page([], 0, 0)),
      ),
    )
    const { router, dialog } = await openRecruitForm()
    // 승인된 내 채널로 채운다
    expect(
      await within(dialog).findByDisplayValue('https://chzzk.naver.com/sky'),
    ).toBeInTheDocument()
    await fillRecruitForm(dialog)
    await userEvent.click(
      await within(dialog).findByRole('button', {
        name: '90,000 HP 보류하고 게시',
      }),
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/recruits/7'),
    )
    expect(body).toMatchObject({
      title: '주말 게임 합방 게스트 모집',
      hostChannelUrl: 'https://chzzk.naver.com/sky',
      content: '공포 게임 3인 플레이',
      feePerPerson: 30000,
      recruitCount: 3,
      expectedMinutes: 60,
    })
    expect(body?.scheduledAt).toMatch(/^\d{4}-\d{2}-\d{2}T21:00:00$/)
    expect(body?.recruitDeadline).toMatch(/^\d{4}-\d{2}-\d{2}T23:59:00$/)
  })

  it('지갑 잔액이 모자라면 충전으로 안내한다', async () => {
    const { dialog } = await openRecruitForm({
      revenueBalanceHp: 0,
      availableTotalHp: 30000,
    })
    const count = within(dialog).getByLabelText('모집 인원')
    await userEvent.clear(count)
    await userEvent.type(count, '3')
    expect(
      await within(dialog).findByRole('link', { name: 'HP 충전하러 가기' }),
    ).toHaveAttribute('href', '/wallet')
  })

  it('잔액이 부족하면(409 INSUFFICIENT_BALANCE) 안내와 지갑 링크를 보여 준다', async () => {
    server.use(
      http.post('*/api/v1/appearances/recruits', () =>
        problem(409, 'INSUFFICIENT_BALANCE', 'HP 잔액이 부족합니다.'),
      ),
    )
    const { dialog } = await openRecruitForm()
    await fillRecruitForm(dialog)
    await userEvent.click(
      await within(dialog).findByRole('button', { name: /HP 보류하고 게시/ }),
    )

    expect(
      await within(dialog).findByText(
        'HP가 부족해 모집글을 올리지 못했어요. 충전한 뒤 다시 올려 주세요.',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('link', { name: 'HP 충전하러 가기' }),
    ).toHaveAttribute('href', '/wallet')
  })

  it('HP 보류가 지연되면(503) 다시 보내지 않고 내 모집글 탭에서 처리 중으로 안내한다', async () => {
    let posts = 0
    server.use(
      http.post('*/api/v1/appearances/recruits', () => {
        posts++
        return problem(503, 'BILLING_UNAVAILABLE', '지연')
      }),
    )
    const { router, dialog } = await openRecruitForm()
    await fillRecruitForm(dialog)
    await userEvent.click(
      await within(dialog).findByRole('button', { name: /HP 보류하고 게시/ }),
    )

    expect(
      await screen.findByText(/HP 보류를 확인하는 중이에요/),
    ).toBeInTheDocument()
    expect(screen.getByText(/잠시 뒤 내 모집글에 나타나요/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/recruits')
    expect(router.state.location.search).toContain('tab=mine')
    expect(router.state.location.search).toContain('holdPending=1')
    expect(screen.queryByRole('dialog', { name: '모집글 올리기' })).toBeNull()
    expect(posts).toBe(1)
  })
})

/** 모집글 상세. 상태는 바뀔 수 있다 */
function mockRecruit(current: { value: Recruit }) {
  mockProfiles()
  server.use(
    http.get('*/api/v1/appearances/recruits/7', () => rs(current.value)),
  )
}

/** 내 지원 전체 (페이지별) */
function mockMyApplications(pages: Application[][]) {
  server.use(
    http.get('*/api/v1/appearances/applications/mine', ({ request }) => {
      const p = Number(new URL(request.url).searchParams.get('page'))
      return rs(page(pages[p] ?? [], p, pages.length))
    }),
  )
}

describe('모집 상세 공통', () => {
  it('상태·kv 패널·채널 링크를 보여 준다', async () => {
    mockRecruit({ value: recruit() })
    mockMyApplications([[]])
    renderApp('/recruits/7', 'INFLUENCER')

    expect(
      await screen.findByRole('heading', {
        name: '주말 게임 합방 게스트 모집',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/^모집 중 · D-/)).toHaveClass('pill', 'warn')
    expect(screen.getByText('공포 게임 3인 플레이')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'https://chzzk.naver.com/host' }),
    ).toHaveAttribute('href', 'https://chzzk.naver.com/host')
    const kv = screen.getByText('1인 출연료').closest('dl') as HTMLElement
    expect(within(kv).getByText('30,000 HP')).toBeInTheDocument()
    expect(within(kv).getByText('3명')).toBeInTheDocument()
    expect(within(kv).getByText('1 / 3명')).toBeInTheDocument()
    expect(within(kv).getByText('4명')).toBeInTheDocument()
    expect(within(kv).getByText('90분')).toBeInTheDocument()
    expect(await screen.findByText('밤새는곰')).toBeInTheDocument()
  })

  it('마감된 글은 조기 마감·기한 마감을 구분한다', async () => {
    const current = {
      value: recruit({
        status: 'CLOSED',
        closeType: 'DEADLINE',
        closedAt: '2999-10-19T00:00:00',
      }),
    }
    mockRecruit(current)
    mockMyApplications([[]])
    renderApp('/recruits/7', 'INFLUENCER')
    expect(await screen.findByText('기한 마감')).toHaveClass('pill', 'mute')
  })

  it('없는 모집글(404)이면 없거나 처리 중이라는 안내를 보여 준다', async () => {
    server.use(
      http.get('*/api/v1/appearances/recruits/7', () =>
        problem(404, 'APPEARANCE_RECRUIT_NOT_FOUND'),
      ),
    )
    renderApp('/recruits/7', 'INFLUENCER')
    expect(
      await screen.findByText('모집글을 찾을 수 없어요'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/없거나 아직 HP 보류를 처리 중인 모집글이에요/),
    ).toBeInTheDocument()
  })
  it('숫자가 아닌 주소면 요청하지 않고 찾을 수 없다고 안내한다', async () => {
    let requested = false
    server.use(
      http.get('*/api/v1/appearances/recruits/:id', () => {
        requested = true
        return problem(400, 'INVALID_REQUEST')
      }),
    )
    renderApp('/recruits/abc', 'INFLUENCER')
    expect(
      await screen.findByText('모집글을 찾을 수 없어요'),
    ).toBeInTheDocument()
    expect(requested).toBe(false)
  })

  it('비회원이 상세에 오면 로그인 안내를 보여 준다', async () => {
    renderApp('/recruits/7', 'GUEST')
    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
  })
})

describe('모집 상세 · 게스트', () => {
  it('지원하지 않은 모집글에 메시지와 함께 지원한다', async () => {
    mockRecruit({ value: recruit() })
    const mine: Application[][] = [[]]
    mockMyApplications(mine)
    let body: unknown
    server.use(
      http.post(
        '*/api/v1/appearances/recruits/7/applications',
        async ({ request }) => {
          body = await request.json()
          mine[0] = [application()]
          return rs(application(), 201)
        },
      ),
    )
    document.cookie = 'XSRF-TOKEN=t'
    renderApp('/recruits/7', 'INFLUENCER')

    await userEvent.type(
      await screen.findByLabelText('지원 메시지 (선택)'),
      '같은 장르로 방송해요',
    )
    await userEvent.click(screen.getByRole('button', { name: '지원하기' }))

    expect(await screen.findByText('지원 완료')).toBeInTheDocument()
    expect(body).toEqual({ message: '같은 장르로 방송해요' })
    expect(
      screen.getByRole('button', { name: '지원 취소' }),
    ).toBeInTheDocument()
  })

  it('정원이 찼어도 지원할 수 있다고 안내한다', async () => {
    mockRecruit({ value: recruit({ selectedCount: 3 }) })
    mockMyApplications([[]])
    renderApp('/recruits/7', 'INFLUENCER')
    expect(
      await screen.findByText(/정원이 찼어도 지원할 수 있어요/),
    ).toBeInTheDocument()
  })

  it('이미 지원했으면(409 DUPLICATE_APPLICATION) 알리고 다시 불러온다', async () => {
    mockRecruit({ value: recruit() })
    const mine: Application[][] = [[]]
    mockMyApplications(mine)
    server.use(
      http.post('*/api/v1/appearances/recruits/7/applications', () => {
        mine[0] = [application({ status: 'WITHDRAWN' })]
        return problem(409, 'DUPLICATE_APPLICATION')
      }),
    )
    document.cookie = 'XSRF-TOKEN=t'
    renderApp('/recruits/7', 'INFLUENCER')

    await userEvent.click(
      await screen.findByRole('button', { name: '지원하기' }),
    )
    expect(
      await screen.findByText('이미 지원한 모집글이에요.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        /지원을 취소했어요. 이 모집글에는 다시 지원할 수 없어요/,
      ),
    ).toBeInTheDocument()
  })

  it('두 번째 페이지에 있는 지원도 찾아 지원 완료로 보여 준다', async () => {
    mockRecruit({ value: recruit() })
    mockMyApplications([
      [application({ id: 60, recruitId: 100 })],
      [application()],
    ])
    renderApp('/recruits/7', 'INFLUENCER')

    expect(await screen.findByText('지원 완료')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '지원하기' })).toBeNull()
  })

  it('지원 취소를 확인하면 다시 지원할 수 없다고 안내한다', async () => {
    mockRecruit({ value: recruit() })
    const mine = [[application()]]
    mockMyApplications(mine)
    let withdrawn = false
    server.use(
      http.post('*/api/v1/appearances/applications/50/withdraw', () => {
        withdrawn = true
        mine[0] = [application({ status: 'WITHDRAWN' })]
        return rs(mine[0][0])
      }),
    )
    document.cookie = 'XSRF-TOKEN=t'
    renderApp('/recruits/7', 'INFLUENCER')

    await userEvent.click(
      await screen.findByRole('button', { name: '지원 취소' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: '지원을 취소할까요?',
    })
    expect(
      within(dialog).getByText(/취소하면 이 모집글에 다시 지원할 수 없어요/),
    ).toBeInTheDocument()
    await userEvent.click(
      within(dialog).getByRole('button', { name: '지원 취소' }),
    )

    expect(
      await screen.findByText(
        /지원을 취소했어요. 이 모집글에는 다시 지원할 수 없어요/,
      ),
    ).toBeInTheDocument()
    expect(withdrawn).toBe(true)
    expect(screen.queryByRole('button', { name: '지원하기' })).toBeNull()
  })

  it('SELECTED는 출연 성립 안내만 보여 준다', async () => {
    mockRecruit({ value: recruit() })
    mockMyApplications([
      [application({ status: 'SELECTED', appearanceId: 300 })],
    ])
    renderApp('/recruits/7', 'INFLUENCER')

    expect(
      await screen.findByText(/호스트가 지원을 수락해 출연이 성립했어요/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '지원 취소' })).toBeNull()
  })

  it('NOT_SELECTED는 미선정 안내만 보이고 다시 지원할 수 없다', async () => {
    mockRecruit({ value: recruit() })
    mockMyApplications([[application({ status: 'NOT_SELECTED' })]])
    renderApp('/recruits/7', 'INFLUENCER')

    expect(await screen.findByText(/선정되지 않았어요/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '지원하기' })).toBeNull()
  })

  it('유저는 인플루언서만 지원할 수 있다는 안내를 본다', async () => {
    mockRecruit({ value: recruit() })
    renderApp('/recruits/7', 'USER')

    expect(
      await screen.findByText('출연 지원은 인플루언서만 할 수 있어요.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '채널 인증하기' })).toHaveAttribute(
      'href',
      '/verify',
    )
    expect(screen.queryByRole('button', { name: '지원하기' })).toBeNull()
  })
})

describe('모집 상세 · 호스트', () => {
  /** 내가 올린 모집글과 지원자 목록 */
  function mockHost(current: { value: Recruit }, applicants: Application[]) {
    mockRecruit(current)
    server.use(
      http.get('*/api/v1/appearances/recruits/7/applications', () =>
        rs(page(applicants)),
      ),
    )
    document.cookie = 'XSRF-TOKEN=t'
  }

  const applicant = (patch: Partial<Application> = {}) =>
    application({ guestId: GUEST_ID, ...patch })

  it('지원자 목록을 보이고 수락하면 출연이 성립한다', async () => {
    const current = { value: recruit({ hostId: ME_ID }) }
    const applicants = [applicant()]
    mockHost(current, applicants)
    let accepted = false
    server.use(
      http.post('*/api/v1/appearances/applications/50/accept', () => {
        accepted = true
        applicants[0] = applicant({ status: 'SELECTED', appearanceId: 300 })
        current.value = recruit({ hostId: ME_ID, selectedCount: 2 })
        return rs(applicants[0])
      }),
    )
    renderApp('/recruits/7', 'INFLUENCER')

    const row = (await screen.findByText('같은 장르로 방송해요')).closest(
      '.appl',
    ) as HTMLElement
    expect(await within(row).findByText('편집하는 고래')).toBeInTheDocument()
    expect(within(row).getByText('대기')).toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: '수락' }))
    const dialog = await screen.findByRole('dialog', {
      name: '지원을 수락할까요?',
    })
    expect(
      within(dialog).getByText(
        /수락하면 바로 출연이 성립돼요. 성립 후 호스트가 취소하면 1인 출연료의 30%/,
      ),
    ).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '수락' }))

    expect(await within(row).findByText('출연 성립')).toBeInTheDocument()
    expect(within(row).getByText('출연 #300')).toBeInTheDocument()
    expect(accepted).toBe(true)
    expect(await screen.findByText('2 / 3명')).toBeInTheDocument()
  })

  it('정원이 찼으면(409 RECRUIT_FULL) 정원이 찼다고 알린다', async () => {
    const current = { value: recruit({ hostId: ME_ID }) }
    mockHost(current, [applicant()])
    server.use(
      http.post('*/api/v1/appearances/applications/50/accept', () =>
        problem(409, 'RECRUIT_FULL'),
      ),
    )
    renderApp('/recruits/7', 'INFLUENCER')

    await userEvent.click(await screen.findByRole('button', { name: '수락' }))
    const dialog = await screen.findByRole('dialog', {
      name: '지원을 수락할까요?',
    })
    await userEvent.click(within(dialog).getByRole('button', { name: '수락' }))
    expect(await screen.findByText('정원이 찼어요.')).toBeInTheDocument()
  })

  it('정원이 다 찼으면 수락 버튼을 막는다', async () => {
    mockHost({ value: recruit({ hostId: ME_ID, selectedCount: 3 }) }, [
      applicant(),
    ])
    renderApp('/recruits/7', 'INFLUENCER')
    expect(await screen.findByRole('button', { name: '수락' })).toBeDisabled()
  })

  it('거절하면 미선정이 된다', async () => {
    const current = { value: recruit({ hostId: ME_ID }) }
    const applicants = [applicant()]
    mockHost(current, applicants)
    server.use(
      http.post('*/api/v1/appearances/applications/50/reject', () => {
        applicants[0] = applicant({ status: 'NOT_SELECTED' })
        return rs(applicants[0])
      }),
    )
    renderApp('/recruits/7', 'INFLUENCER')

    await userEvent.click(await screen.findByRole('button', { name: '거절' }))
    const dialog = await screen.findByRole('dialog', {
      name: '지원을 거절할까요?',
    })
    await userEvent.click(within(dialog).getByRole('button', { name: '거절' }))
    expect(await screen.findByText('미선정')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '수락' })).toBeNull()
  })

  it('조기 마감 모달은 돌려받을 HP(출연료 × 남은 자리)를 보여 주고 마감한다', async () => {
    const current = { value: recruit({ hostId: ME_ID }) }
    mockHost(current, [])
    server.use(
      http.post('*/api/v1/appearances/recruits/7/close', () => {
        current.value = recruit({
          hostId: ME_ID,
          status: 'CLOSED',
          closeType: 'EARLY',
          closedAt: '2026-10-15T12:00:00',
          hpReleaseStatus: 'PENDING',
        })
        return rs(current.value)
      }),
    )
    renderApp('/recruits/7', 'INFLUENCER')

    await userEvent.click(
      await screen.findByRole('button', { name: '조기 마감' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: '모집을 조기 마감할까요?',
    })
    expect(
      within(dialog).getByText(/대기 중인 지원은 모두 미선정이 되고/),
    ).toBeInTheDocument()
    // 30,000 × (3 − 1)
    expect(within(dialog).getByText('60,000')).toBeInTheDocument()
    await userEvent.click(
      within(dialog).getByRole('button', { name: '조기 마감' }),
    )

    // 다시 불러오기 전까지는 같은 이름의 버튼이 남아 있으므로, 버튼이 사라진 뒤 상태를 본다.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '조기 마감' })).toBeNull(),
    )
    expect(screen.getByText('조기 마감')).toHaveClass('pill')
    expect(
      screen.getByText(/성립하지 못한 자리분 HP를 돌려받는 중이에요/),
    ).toBeInTheDocument()
  })

  it('기본 정보를 고치면 바뀐 값만 보낸다', async () => {
    const current = { value: recruit({ hostId: ME_ID }) }
    mockHost(current, [])
    let body: unknown
    server.use(
      http.patch('*/api/v1/appearances/recruits/7', async ({ request }) => {
        body = await request.json()
        current.value = recruit({ hostId: ME_ID, title: '바뀐 제목' })
        return rs(current.value)
      }),
    )
    renderApp('/recruits/7', 'INFLUENCER')

    await userEvent.click(
      await screen.findByRole('button', { name: '기본 정보 수정' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: '기본 정보 수정',
    })
    const title = within(dialog).getByLabelText('제목')
    await userEvent.clear(title)
    await userEvent.type(title, '바뀐 제목')
    await userEvent.click(within(dialog).getByRole('button', { name: '저장' }))

    expect(
      await screen.findByRole('heading', { name: '바뀐 제목' }),
    ).toBeInTheDocument()
    expect(body).toEqual({ title: '바뀐 제목' })
  })

  it('반환 실패(DEAD)면 고객센터로 안내한다', async () => {
    mockHost(
      {
        value: recruit({
          hostId: ME_ID,
          status: 'CLOSED',
          closeType: 'DEADLINE',
          hpReleaseStatus: 'DEAD',
        }),
      },
      [],
    )
    renderApp('/recruits/7', 'INFLUENCER')
    expect(
      await screen.findByText(
        /HP 반환이 늦어지고 있어요. 고객센터로 문의해 주세요/,
      ),
    ).toBeInTheDocument()
  })

  it('지원자 옆 채팅 버튼으로 채팅방을 연다', async () => {
    mockHost({ value: recruit({ hostId: ME_ID }) }, [applicant()])
    let target: unknown
    server.use(
      http.post('*/api/v1/chats', async ({ request }) => {
        target = await request.json()
        return rs({ chatRoomId: 77 })
      }),
    )
    const router = renderApp('/recruits/7', 'INFLUENCER')

    await userEvent.click(await screen.findByRole('button', { name: '채팅' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/chat/77'))
    expect(target).toEqual({ targetUserId: GUEST_ID })
  })
})
