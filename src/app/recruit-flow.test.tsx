import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { recruitsQuery } from '@/entities/appearance/api'
import type {
  Application,
  Recruit,
  RecruitSummary,
} from '@/entities/appearance/types'
import { kstLocalInput } from '@/shared/lib/date'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import {
  expectFieldError,
  expectNoFieldError,
  expectSubmitBlocked,
  expectSubmitOpen,
} from '@/test/fieldError'
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
  myApplication: null,
  version: 0,
  updatedAt: '2026-10-14T10:00:00',
  ...patch,
})

const application = (patch: Partial<Application> = {}): Application => ({
  id: 50,
  recruitId: 7,
  recruitTitle: '주말 게임 합방 게스트 모집',
  recruitScheduledAt: '2999-10-20T21:00:00',
  recruitStatus: 'RECRUITING',
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
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('tabpanel')).toBeNull()
    expect(screen.queryByRole('button', { name: '모집글 올리기' })).toBeNull()
  })

  it('탭과 선택된 탭의 패널이 aria로 연결된다', async () => {
    mockProfiles()
    server.use(
      http.get('*/api/v1/appearances/recruits/mine', () =>
        rs(page([summary({ id: 8, hostId: ME_ID, title: '내가 올린 모집' })])),
      ),
    )
    renderApp('/recruits?tab=mine', 'INFLUENCER')

    const panel = await screen.findByRole('tabpanel', { name: '내 모집글' })
    expect(
      await within(panel).findByRole('link', { name: /내가 올린 모집/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tablist', { name: '모집 목록' }),
    ).toBeInTheDocument()
    const tab = screen.getByRole('tab', { name: '내 모집글' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(tab).toHaveAttribute('aria-controls', panel.id)
    expect(screen.getByRole('tab', { name: '모집 중' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('화살표·Home·End 키는 포커스만 옮기고 Enter로 고르면 URL tab이 바뀐다', async () => {
    mockProfiles()
    server.use(
      http.get('*/api/v1/appearances/recruits', () => rs(page([summary()]))),
      http.get('*/api/v1/appearances/applications/mine', () =>
        rs(page([application()])),
      ),
    )
    const router = renderApp('/recruits', 'INFLUENCER')
    await screen.findByRole('link', { name: /주말 게임 합방 게스트 모집/ })
    const tab = (name: string) => screen.getByRole('tab', { name })

    tab('모집 중').focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(tab('내 모집글')).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(tab('내 지원')).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(tab('모집 중')).toHaveFocus()
    // 처음에서 ←를 누르면 끝으로 돈다.
    await userEvent.keyboard('{ArrowLeft}')
    expect(tab('내 지원')).toHaveFocus()
    // 수동 활성화: 포커스만 옮겨서는 탭이 바뀌지 않는다.
    expect(router.state.location.search).toBe('')
    expect(tab('모집 중')).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{Enter}')
    const panel = await screen.findByRole('tabpanel', { name: '내 지원' })
    expect(router.state.location.search).toBe('?tab=applications')
    expect(
      await within(panel).findByRole('link', {
        name: '주말 게임 합방 게스트 모집',
      }),
    ).toBeInTheDocument()
    expect(tab('내 지원')).toHaveFocus()
  })

  it('내 지원 탭은 모집 제목 링크·방송 일시·모집 상태·지원 상태·지원일을 보여 준다', async () => {
    let detailRequested = false
    server.use(
      http.get('*/api/v1/appearances/applications/mine', () =>
        rs(
          page([
            application(),
            application({
              id: 51,
              recruitId: 9,
              recruitTitle: '공포 게임 합방',
              recruitScheduledAt: '2026-10-12T20:00:00',
              recruitStatus: 'CLOSED',
              status: 'SELECTED',
              createdAt: '2026-10-01T11:00:00',
            }),
          ]),
        ),
      ),
      http.get('*/api/v1/appearances/recruits/:id', () => {
        detailRequested = true
        return rs(recruit())
      }),
    )
    renderApp('/recruits?tab=applications', 'INFLUENCER')

    const firstLink = await screen.findByRole('link', {
      name: '주말 게임 합방 게스트 모집',
    })
    expect(firstLink).toHaveAttribute('href', '/recruits/7')
    const first = firstLink.closest('.row-item') as HTMLElement
    expect(
      within(first).getByText(
        /^방송 10\/20\(.\) 21:00 · 10\/15\(.\) 09:00 지원$/,
      ),
    ).toBeInTheDocument()
    expect(within(first).getByText('모집 중')).toHaveClass('pill', 'warn')
    expect(within(first).getByText('대기')).toHaveClass('pill', 'info')

    const secondLink = screen.getByRole('link', { name: '공포 게임 합방' })
    expect(secondLink).toHaveAttribute('href', '/recruits/9')
    const second = secondLink.closest('.row-item') as HTMLElement
    expect(
      within(second).getByText(
        /^방송 10\/12\(.\) 20:00 · 10\/1\(.\) 11:00 지원$/,
      ),
    ).toBeInTheDocument()
    expect(within(second).getByText('마감')).toHaveClass('pill', 'mute')
    expect(within(second).getByText('출연 성립')).toHaveClass('pill', 'ok')
    // 제목을 얻으려고 행마다 모집 상세를 부르지 않는다.
    expect(detailRequested).toBe(false)
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
/** approvedChannel: false면 승인된 내 채널이 없어 채널 주소를 채우지 않는다 */
async function openRecruitForm(wallet = {}, { approvedChannel = true } = {}) {
  server.use(
    http.get('*/api/v1/appearances/recruits', () => rs(page([], 0, 0))),
    http.get('*/api/v1/appearances/recruits/mine', () => rs(page([], 0, 0))),
    http.get('*/api/v1/members/channels/me', () =>
      rs(
        approvedChannel
          ? [
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
            ]
          : [],
      ),
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
    expect(
      within(dialog).getByText(
        '마감하면 채우지 못한 자리의 출연료를 돌려받아요.',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        /마감하면 채우지 못한 자리의 출연료를 쓴 종류 그대로 돌려받아요/,
      ),
    ).toBeInTheDocument()
    // 제목·콘텐츠 설명이 비어 있어 게시할 수 없다.
    expectSubmitBlocked(
      await within(dialog).findByRole('button', {
        name: '90,000 HP 보류하고 게시',
      }),
    )

    await userEvent.clear(count)
    await userEvent.type(count, '11')
    await userEvent.tab()
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
    ).toHaveAttribute('href', '/wallet?charge=30000')
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
    // 내 모집글 탭으로 옮겨 부르는 목록 조회까지 끝나야 다음 테스트의 핸들러로 새지 않는다.
    // (이동은 비동기라 진행 중 조회 수만 보면 조회가 시작되기 전일 수 있다)
    await waitFor(() =>
      expect(
        queryClient.getQueryState(recruitsQuery('mine', 0).queryKey)?.status,
      ).toBe('success'),
    )
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })
})

/** 모집글 상세. 상태는 바뀔 수 있다 */
function mockRecruit(current: { value: Recruit }) {
  mockProfiles()
  server.use(
    http.get('*/api/v1/appearances/recruits/7', () => rs(current.value)),
  )
}

describe('모집 상세 공통', () => {
  it('상태·kv 패널·채널 링크를 보여 준다', async () => {
    mockRecruit({ value: recruit() })
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
    const current = { value: recruit() }
    mockRecruit(current)
    let body: unknown
    server.use(
      http.post(
        '*/api/v1/appearances/recruits/7/applications',
        async ({ request }) => {
          body = await request.json()
          current.value = recruit({ myApplication: application() })
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
    renderApp('/recruits/7', 'INFLUENCER')
    expect(
      await screen.findByText(/정원이 찼어도 지원할 수 있어요/),
    ).toBeInTheDocument()
  })

  it('이미 지원했으면(409 DUPLICATE_APPLICATION) 알리고 다시 불러온다', async () => {
    const current = { value: recruit() }
    mockRecruit(current)
    server.use(
      http.post('*/api/v1/appearances/recruits/7/applications', () => {
        current.value = recruit({
          myApplication: application({ status: 'WITHDRAWN' }),
        })
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

  it('모집 상세를 열 때 내 지원 목록 API를 부르지 않는다', async () => {
    mockRecruit({ value: recruit({ myApplication: application() }) })
    let listed = 0
    server.use(
      http.get('*/api/v1/appearances/applications/mine', () => {
        listed += 1
        return rs(page([]))
      }),
    )
    renderApp('/recruits/7', 'INFLUENCER')

    expect(await screen.findByText('지원 완료')).toBeInTheDocument()
    expect(
      screen.getByText('내 메시지: 같은 장르로 방송해요'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '지원하기' })).toBeNull()
    expect(listed).toBe(0)
  })

  it('지원 취소를 확인하면 다시 지원할 수 없다고 안내한다', async () => {
    const current = { value: recruit({ myApplication: application() }) }
    mockRecruit(current)
    let withdrawn = false
    server.use(
      http.post('*/api/v1/appearances/applications/50/withdraw', () => {
        withdrawn = true
        const mine = application({ status: 'WITHDRAWN' })
        current.value = recruit({ myApplication: mine })
        return rs(mine)
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

  it('내 지원 탭에서 연 모집글의 지원을 취소하면 내 지원 탭에 지원 취소로 보인다', async () => {
    const mine = { value: application() }
    mockProfiles()
    server.use(
      http.get('*/api/v1/appearances/recruits/7', () =>
        rs(recruit({ myApplication: mine.value })),
      ),
      http.get('*/api/v1/appearances/applications/mine', () =>
        rs(page([mine.value])),
      ),
      http.post('*/api/v1/appearances/applications/50/withdraw', () => {
        mine.value = application({ status: 'WITHDRAWN' })
        return rs(mine.value)
      }),
    )
    document.cookie = 'XSRF-TOKEN=t'
    const router = renderApp('/recruits?tab=applications', 'INFLUENCER')

    await userEvent.click(
      await screen.findByRole('link', { name: '주말 게임 합방 게스트 모집' }),
    )
    await userEvent.click(
      await screen.findByRole('button', { name: '지원 취소' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: '지원을 취소할까요?',
    })
    await userEvent.click(
      within(dialog).getByRole('button', { name: '지원 취소' }),
    )
    expect(
      await screen.findByText(/지원을 취소했어요. 이 모집글에는/),
    ).toBeInTheDocument()

    await router.navigate('/recruits?tab=applications')
    const row = (
      await screen.findByRole('link', { name: '주말 게임 합방 게스트 모집' })
    ).closest('.row-item') as HTMLElement
    expect(await within(row).findByText('지원 취소')).toHaveClass('pill')
    expect(within(row).queryByText('대기')).toBeNull()
  })

  it('SELECTED는 출연 성립 안내만 보여 준다', async () => {
    mockRecruit({
      value: recruit({
        myApplication: application({ status: 'SELECTED', appearanceId: 300 }),
      }),
    })
    renderApp('/recruits/7', 'INFLUENCER')

    expect(
      await screen.findByText(/호스트가 지원을 수락해 출연이 성립했어요/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '지원 취소' })).toBeNull()
  })

  it('NOT_SELECTED는 미선정 안내만 보이고 다시 지원할 수 없다', async () => {
    mockRecruit({
      value: recruit({
        myApplication: application({ status: 'NOT_SELECTED' }),
      }),
    })
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
    expect(
      screen.getByText(/채우지 못한 자리의 출연료를 돌려받아요/),
    ).toBeInTheDocument()
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

  it('정원이 찼으면 대기 지원이 다른 페이지에 있어도 조기 마감 안내를 보여 준다', async () => {
    mockHost({ value: recruit({ hostId: ME_ID, selectedCount: 3 }) }, [
      applicant({ status: 'SELECTED', appearanceId: 300 }),
    ])
    renderApp('/recruits/7', 'INFLUENCER')
    expect(
      await screen.findByText(/정원이 다 차서 더 수락할 수 없어요/),
    ).toBeInTheDocument()
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
      within(dialog).getByText(
        /대기 중인 지원은 모두 미선정이 되고, 채우지 못한 자리의 출연료\(1인 출연료 × \(모집 인원 − 성립 인원\)\)를 돌려받아요/,
      ),
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
      screen.getByText('채우지 못한 자리의 출연료를 돌려받는 중이에요.'),
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

  it('기본 정보 수정에서 제목을 비운 채 떠나면 오류를 보여 주고 저장을 막는다', async () => {
    mockHost({ value: recruit({ hostId: ME_ID }) }, [])
    renderApp('/recruits/7', 'INFLUENCER')

    await userEvent.click(
      await screen.findByRole('button', { name: '기본 정보 수정' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: '기본 정보 수정',
    })
    const title = within(dialog).getByLabelText('제목')
    expectNoFieldError(title)
    await userEvent.clear(title)
    expectNoFieldError(title)
    await userEvent.tab()

    expectFieldError(title, '제목을 입력해 주세요.')
    expectSubmitBlocked(within(dialog).getByRole('button', { name: '저장' }))
    // 막힌 저장을 눌러도 보내지 않고 오류 칸으로 포커스한다.
    await userEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(title).toHaveFocus())
    await userEvent.type(title, '바뀐 제목')
    expectNoFieldError(title)
    expectSubmitOpen(within(dialog).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it.each([
    ['PENDING', '채우지 못한 자리의 출연료를 돌려받는 중이에요.'],
    ['DONE', '채우지 못한 자리의 출연료를 돌려받았어요.'],
    [
      'DEAD',
      '채우지 못한 자리의 출연료 반환을 처리하지 못했어요. 고객센터로 문의해 주세요.',
    ],
  ] as const)('반환이 %s 상태면 "%s"를 보여 준다', async (status, text) => {
    mockHost(
      {
        value: recruit({
          hostId: ME_ID,
          status: 'CLOSED',
          closeType: 'DEADLINE',
          hpReleaseStatus: status,
        }),
      },
      [],
    )
    renderApp('/recruits/7', 'INFLUENCER')
    const note = await screen.findByText(text)
    // 실패만 경고색으로 보인다.
    if (status === 'DEAD') expect(note).toHaveClass('c-bad')
    else expect(note).not.toHaveClass('c-bad')
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

describe('모집글 폼 입력 오류 표시', () => {
  const field = (dialog: HTMLElement, label: string) =>
    within(dialog).getByLabelText(label)
  const submitButton = (dialog: HTMLElement) =>
    within(dialog).findByRole('button', { name: /HP 보류하고 게시/ })
  /** 오류가 표시된 칸: .field.invalid · aria-invalid · 오류 문구 연결 */
  const expectInvalid = (
    dialog: HTMLElement,
    label: string,
    message: string,
  ) => {
    const input = field(dialog, label)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.closest('.field')).toHaveClass('invalid')
    expect(input).toHaveAccessibleDescription(message)
  }
  const expectValid = (dialog: HTMLElement, label: string) => {
    const input = field(dialog, label)
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input.closest('.field')).not.toHaveClass('invalid')
  }

  /** 모달을 닫기 전 남은 조회(잔액·채널)가 끝나야 다음 테스트로 새지 않는다 */
  const settle = () => waitFor(() => expect(queryClient.isFetching()).toBe(0))

  it('빈 폼이면 오류가 없고 게시 버튼은 비활성이다', async () => {
    const { dialog } = await openRecruitForm()
    expectSubmitBlocked(await submitButton(dialog))
    expect(within(dialog).queryByRole('alert')).toBeNull()
    expect(dialog.querySelector('[aria-invalid="true"]')).toBeNull()
    expect(dialog.querySelector('.field.invalid')).toBeNull()
    await settle()
  })

  it('제목을 비운 채 떠나면 제목에 오류·빨간 테두리·aria-invalid가 생긴다', async () => {
    const { dialog } = await openRecruitForm()
    await userEvent.click(field(dialog, '제목'))
    expectValid(dialog, '제목')
    await userEvent.tab()

    expectInvalid(dialog, '제목', '제목을 입력해 주세요.')
    // 아직 건드리지 않은 아래 칸(콘텐츠 설명)은 오류가 없다.
    expectValid(dialog, '콘텐츠 설명')
    await settle()
  })

  it('제목·출연료를 건너뛰고 아래 칸을 누르면 화면 순서상 가장 위인 제목에만 오류가 뜬다', async () => {
    const { dialog } = await openRecruitForm()
    // 출연료를 포커스하지 않고 비운다(포커스하면 건너뛰기가 아니다).
    fireEvent.change(field(dialog, '1인 출연료 (HP)'), {
      target: { value: '' },
    })
    await userEvent.click(field(dialog, '콘텐츠 설명'))

    expectInvalid(dialog, '제목', '제목을 입력해 주세요.')
    expectValid(dialog, '1인 출연료 (HP)')
    // 지금 포커스한 칸은 떠나기 전이라 아직 오류가 없다.
    expectValid(dialog, '콘텐츠 설명')

    // 다른 아래 칸으로 옮겨도 위에 이미 보이는 오류가 있으면 더 늘리지 않는다.
    await userEvent.click(field(dialog, '예상 출연 시간 (분)'))
    expectValid(dialog, '1인 출연료 (HP)')
    // 떠난 칸(콘텐츠 설명)은 그대로 오류를 보여 준다.
    expectInvalid(dialog, '콘텐츠 설명', '콘텐츠 설명을 입력해 주세요.')
    await settle()
  })

  it('값을 고치면 오류가 바로 사라지고, 모든 값이 맞으면 게시 버튼이 활성이 된다', async () => {
    const { dialog } = await openRecruitForm()
    await userEvent.click(field(dialog, '제목'))
    await userEvent.tab()
    expectInvalid(dialog, '제목', '제목을 입력해 주세요.')

    await userEvent.type(field(dialog, '제목'), '주말 합방')
    expectValid(dialog, '제목')
    expect(within(dialog).queryByText('제목을 입력해 주세요.')).toBeNull()
    // 콘텐츠 설명이 비어 있어 아직 막혀 있다.
    expectSubmitBlocked(await submitButton(dialog))

    await userEvent.type(field(dialog, '콘텐츠 설명'), '공포 게임')
    expectSubmitOpen(await submitButton(dialog))
    await settle()
  })

  it('제목만 쓰고 게시를 누르면 요청을 보내지 않고 화면 순서상 첫 오류 칸(채널 주소) 하나만 오류를 보여 주며 포커스한다', async () => {
    let posts = 0
    server.use(
      http.post('*/api/v1/appearances/recruits', () => {
        posts++
        return rs(recruit(), 201)
      }),
    )
    const scrolled: Element[] = []
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this)
    })
    onTestFinished(() => {
      delete (Element.prototype as Partial<Element>).scrollIntoView
    })
    const { dialog } = await openRecruitForm({}, { approvedChannel: false })
    await userEvent.type(field(dialog, '제목'), '주말 합방')
    const submit = await submitButton(dialog)
    expectSubmitBlocked(submit)
    await userEvent.click(submit)

    const channel = field(dialog, '내 채널 주소')
    expectInvalid(
      dialog,
      '내 채널 주소',
      '채널 주소는 http:// 또는 https://로 시작해야 해요.',
    )
    await waitFor(() => expect(channel).toHaveFocus())
    expect(scrolled.at(-1)).toBe(channel)
    // 아래의 콘텐츠 설명은 아직 보여 주지 않는다.
    expectValid(dialog, '콘텐츠 설명')
    expect(posts).toBe(0)
    await settle()
  })

  it('서버 400 필드 오류가 오면 그 칸에 표시하고 포커스·스크롤하며, 그 칸을 고치면 사라진다', async () => {
    server.use(
      http.post('*/api/v1/appearances/recruits', () =>
        HttpResponse.json(
          {
            status: 400,
            code: 'INVALID_REQUEST',
            detail: '요청 값이 올바르지 않습니다.',
            errors: [
              {
                field: 'hostChannelUrl',
                message: '치지직 채널 주소가 아니에요.',
              },
            ],
          },
          { status: 400 },
        ),
      ),
    )
    // jsdom에는 scrollIntoView가 없어 이 테스트에서만 심는다
    const scrolled: Element[] = []
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this)
    })
    onTestFinished(() => {
      delete (Element.prototype as Partial<Element>).scrollIntoView
    })
    const { dialog } = await openRecruitForm()
    await fillRecruitForm(dialog)
    await userEvent.click(await submitButton(dialog))

    await waitFor(() =>
      expectInvalid(dialog, '내 채널 주소', '치지직 채널 주소가 아니에요.'),
    )
    await waitFor(() => expect(field(dialog, '내 채널 주소')).toHaveFocus())
    expect(scrolled.at(-1)).toBe(field(dialog, '내 채널 주소'))

    await userEvent.type(field(dialog, '내 채널 주소'), 'x')
    expect(
      within(dialog).queryByText('치지직 채널 주소가 아니에요.'),
    ).toBeNull()
    // 고치는 중에도 클라이언트 검사 오류가 남으면 계속 보여 준다(떠나기 전이라도).
    await userEvent.clear(field(dialog, '내 채널 주소'))
    expect(field(dialog, '내 채널 주소')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    await settle()
  })
})
