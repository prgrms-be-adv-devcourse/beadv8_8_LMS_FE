import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type {
  UpgradeRequestStatus,
  UpgradeReview,
} from '@/entities/member/types'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const review = (patch: Partial<UpgradeReview> = {}): UpgradeReview => ({
  requestId: 3,
  memberId: 9,
  nickname: '새벽기타',
  requestReason: '통기타 라이브 세팅 5강\n1강 픽업 고르기',
  status: 'PENDING',
  requestedAt: '2026-10-14T10:00:00',
  reviewedAt: null,
  reviewedBy: null,
  rejectionReason: null,
  channels: [
    {
      platform: 'CHZZK',
      channelName: '새벽기타 채널',
      channelUrl: 'https://chzzk.naver.com/dawn',
      followerCount: 1840,
    },
  ],
  ...patch,
})

const paged = (content: UpgradeReview[]) => ({
  content,
  page: { size: 10, number: 0, totalElements: content.length, totalPages: 1 },
})

/** 상태별 목록. pending은 처리하면 바뀐다 */
function mockReviews(
  lists: Partial<Record<UpgradeRequestStatus, UpgradeReview[]>>,
) {
  const seen: string[] = []
  server.use(
    http.get('*/api/v1/members/admin/upgrade-requests', ({ request }) => {
      const status = new URL(request.url).searchParams.get(
        'status',
      ) as UpgradeRequestStatus
      seen.push(new URL(request.url).search)
      return rs(paged(lists[status] ?? []))
    }),
  )
  return seen
}

afterEach(() => queryClient.clear())

describe('관리자 승급 심사', () => {
  it('심사 대기 신청을 신청자·승인된 채널·사유와 함께 보여 주고 대기 건수를 센다', async () => {
    const seen = mockReviews({ PENDING: [review()] })
    renderApp('/admin/promotions', 'ADMIN')

    const item = await screen.findByRole('listitem', {
      name: '새벽기타의 승급 신청',
    })
    expect(within(item).getByText('회원 #9')).toBeInTheDocument()
    expect(
      within(item).getByRole('link', { name: /새벽기타 채널 · 팔로워 1,840/ }),
    ).toHaveAttribute('href', 'https://chzzk.naver.com/dawn')
    expect(within(item).getByText(/1강 픽업 고르기/)).toBeInTheDocument()
    expect(screen.getByText('대기 1건')).toBeInTheDocument()
    expect(seen).toContain('?status=PENDING&page=0&size=10')
  })

  it('승인하면 목록을 다시 불러와 대기에서 빠진다', async () => {
    let pending = [review()]
    let approved: string | undefined
    document.cookie = 'XSRF-TOKEN=t'
    server.use(
      http.get('*/api/v1/members/admin/upgrade-requests', () =>
        rs(paged(pending)),
      ),
      http.post(
        '*/api/v1/members/admin/upgrade-requests/:id/approve',
        ({ params }) => {
          approved = String(params.id)
          pending = []
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )
    renderApp('/admin/promotions', 'ADMIN')
    const item = await screen.findByRole('listitem', {
      name: '새벽기타의 승급 신청',
    })
    await userEvent.click(within(item).getByRole('button', { name: '승인' }))

    expect(
      await screen.findByText('심사 대기 신청이 없어요'),
    ).toBeInTheDocument()
    expect(approved).toBe('3')
    expect(screen.getByText('모두 처리함')).toBeInTheDocument()
  })

  it('반려는 자주 쓰는 사유를 고르거나 직접 적어 보낸다', async () => {
    let body: unknown
    document.cookie = 'XSRF-TOKEN=t'
    mockReviews({ PENDING: [review()] })
    server.use(
      http.post(
        '*/api/v1/members/admin/upgrade-requests/3/reject',
        async ({ request }) => {
          body = await request.json()
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )
    renderApp('/admin/promotions', 'ADMIN')
    const item = await screen.findByRole('listitem', {
      name: '새벽기타의 승급 신청',
    })
    await userEvent.click(within(item).getByRole('button', { name: '반려' }))

    const confirm = within(item).getByRole('button', { name: '반려' })
    expect(confirm).toBeDisabled()
    await userEvent.click(
      within(item).getByRole('button', { name: /목차를 더 적어 주세요/ }),
    )
    expect(within(item).getByLabelText('반려 사유')).toHaveValue(
      '강의 계획이 구체적이지 않아요. 목차를 더 적어 주세요',
    )
    await userEvent.type(
      within(item).getByLabelText('반려 사유'),
      ' (3강 이상)',
    )
    await userEvent.click(confirm)
    await waitFor(() =>
      expect(body).toEqual({
        reason:
          '강의 계획이 구체적이지 않아요. 목차를 더 적어 주세요 (3강 이상)',
      }),
    )
  })

  it('반려 탭은 처리일과 반려 사유를 보여 주고 심사 버튼이 없다', async () => {
    mockReviews({
      PENDING: [],
      REJECTED: [
        review({
          status: 'REJECTED',
          reviewedAt: '2026-10-15T09:00:00',
          reviewedBy: 7,
          rejectionReason: '최근 방송 기록이 부족해요',
          channels: [],
        }),
      ],
    })
    const router = renderApp('/admin/promotions', 'ADMIN')
    await screen.findByText('심사 대기 신청이 없어요')
    await userEvent.click(screen.getByRole('button', { name: '반려' }))

    expect(router.state.location.search).toBe('?status=REJECTED')
    const item = await screen.findByRole('listitem', {
      name: '새벽기타의 승급 신청',
    })
    expect(within(item).getByText(/처리/)).toBeInTheDocument()
    expect(
      within(item).getByText('반려 사유: 최근 방송 기록이 부족해요'),
    ).toBeInTheDocument()
    expect(within(item).getByText('승인된 채널이 없어요')).toBeInTheDocument()
    expect(within(item).queryByRole('button')).toBeNull()
  })

  it('이미 처리된 신청이면 안내하고 목록을 다시 불러온다', async () => {
    let calls = 0
    document.cookie = 'XSRF-TOKEN=t'
    server.use(
      http.get('*/api/v1/members/admin/upgrade-requests', () => {
        calls++
        return rs(paged([review()]))
      }),
      http.post('*/api/v1/members/admin/upgrade-requests/3/approve', () =>
        HttpResponse.json(
          {
            code: 'UPGRADE_REQUEST_REVIEW_NOT_ALLOWED',
            detail: '심사 대기 중인 승급 신청만 승인·반려할 수 있습니다.',
          },
          { status: 409 },
        ),
      ),
    )
    renderApp('/admin/promotions', 'ADMIN')
    const item = await screen.findByRole('listitem', {
      name: '새벽기타의 승급 신청',
    })
    const before = calls
    await userEvent.click(within(item).getByRole('button', { name: '승인' }))
    expect(
      await screen.findByText(
        '이미 처리된 신청이에요. 목록을 새로 불러왔어요.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(calls).toBeGreaterThan(before))
  })

  it('관리자가 아니면 열 수 없다', async () => {
    renderApp('/admin/promotions', 'VERIFIED_INFLUENCER')
    expect(await screen.findByText(/권한|볼 수 없/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '승급 심사' })).toBeNull()
  })
})
