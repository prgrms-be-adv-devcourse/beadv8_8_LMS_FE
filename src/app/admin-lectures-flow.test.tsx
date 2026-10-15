import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type {
  InspectionLecture,
  LectureDetail,
  LectureStatus,
} from '@/entities/lecture/types'
import { formatDate } from '@/shared/lib/date'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const inspection = (
  overrides: Partial<InspectionLecture> = {},
): InspectionLecture => ({
  lectureId: 1,
  sellerUserId: 9,
  sellerNickname: '새벽라디오 윤',
  title: '노래방송 저작권 기초',
  priceHp: 11000,
  status: 'PENDING_INSPECTION',
  inspectionRequestedAt: '2026-10-11T10:00:00',
  ...overrides,
})

const detail = (overrides: Partial<LectureDetail> = {}) => ({
  lectureId: 1,
  sellerUserId: 9,
  sellerNickname: '새벽라디오 윤',
  title: '노래방송 저작권 기초',
  description: '반주·원곡·커버의 저작권 범위를 정리해요.',
  priceHp: 11000,
  thumbnailUrl: null,
  thumbnailFileId: null,
  status: 'PENDING_INSPECTION' as LectureStatus,
  rejectionReason: null,
  deleted: false,
  averageRating: null,
  reviewCount: 0,
  contents: [
    {
      contentId: 12,
      fileId: 102,
      title: '반주 음원 고르는 법',
      sequence: 2,
      contentType: 'DOCUMENT' as const,
    },
    {
      contentId: 11,
      fileId: 101,
      title: '노래방송과 저작권 기초',
      sequence: 1,
      contentType: 'VIDEO' as const,
    },
  ],
  createdAt: '2026-10-09T10:00:00',
  ...overrides,
})

const page = <T,>(content: T[], number = 0, totalPages = 1) => ({
  content,
  page: {
    size: 20,
    number,
    totalElements: content.length,
    totalPages,
  },
})

/** 상태별 검수 목록을 정한다. 요청 search를 모아 돌려준다. */
function serveInspections(
  byStatus: Partial<Record<LectureStatus, InspectionLecture[]>> = {},
  totalPages = 1,
) {
  const seen: string[] = []
  server.use(
    http.get('*/api/v1/lectures/admin/inspections', ({ request }) => {
      const url = new URL(request.url)
      seen.push(url.search)
      const status = url.searchParams.get('status') as LectureStatus
      const p = Number(url.searchParams.get('page'))
      return rs(page(byStatus[status] ?? [], p, totalPages))
    }),
  )
  return seen
}

/** 관리자 상세와 시청 URL을 정한다. 상세는 부를 때마다 다음 응답을 쓴다(마지막은 반복). */
function serveDetail(...responses: ReturnType<typeof detail>[]) {
  let calls = 0
  server.use(
    http.get('*/api/v1/lectures/admin/1', () =>
      rs(responses[Math.min(calls++, responses.length - 1)]),
    ),
    http.get('*/api/v1/lectures/1/contents/:contentId/access', ({ params }) =>
      rs({
        url: `https://cdn.example/${String(params.contentId)}`,
        expiresAt: '2026-10-15T11:00:00',
      }),
    ),
  )
  return () => calls
}

afterEach(() => {
  queryClient.clear()
})

describe('강의 검수 목록', () => {
  it('기본은 검수 대기 탭이고 오래된 신청부터 행을 보여 준다', async () => {
    const seen = serveInspections({ PENDING_INSPECTION: [inspection()] })
    renderApp('/admin/lectures', 'ADMIN')

    const go = await screen.findByRole('link', { name: '검수하기' })
    expect(go).toHaveAttribute('href', '/admin/lectures/1')
    const row = go.closest('.q-item') as HTMLElement
    expect(within(row).getByText('노래방송 저작권 기초')).toBeInTheDocument()
    expect(within(row).getByText('검수 대기')).toBeInTheDocument()
    expect(
      within(row).getByText(
        `새벽라디오 윤 · ${formatDate('2026-10-11T10:00:00')} 신청 · 11,000 HP`,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('대기 1건')).toBeInTheDocument()
    expect(seen[0]).toBe('?status=PENDING_INSPECTION&page=0&size=20')
    expect(
      screen.getByRole('button', { name: '검수 대기', pressed: true }),
    ).toBeInTheDocument()
  })

  it('탭을 바꾸면 URL과 요청이 바뀌고 처리된 강의는 보기 버튼이다', async () => {
    const seen = serveInspections({
      PENDING_INSPECTION: [inspection()],
      REJECTED: [
        inspection({
          lectureId: 2,
          title: '썸네일 30분 컷',
          status: 'REJECTED',
        }),
      ],
    })
    const router = renderApp('/admin/lectures', 'ADMIN')
    await screen.findByRole('link', { name: '검수하기' })

    await userEvent.click(screen.getByRole('button', { name: '반려' }))

    const view = await screen.findByRole('link', { name: '보기' })
    expect(view).toHaveAttribute('href', '/admin/lectures/2')
    expect(router.state.location.search).toBe('?status=REJECTED')
    expect(seen).toContain('?status=REJECTED&page=0&size=20')
    expect(
      within(view.closest('.q-item') as HTMLElement).getByText('반려'),
    ).toHaveClass('pill', 'bad')
    // 머리글은 탭과 관계없이 검수 대기 건수다.
    expect(screen.getByText('대기 1건')).toBeInTheDocument()
  })

  it('대기 강의가 없으면 모두 처리함과 빈 상태를 보여 준다', async () => {
    serveInspections()
    renderApp('/admin/lectures', 'ADMIN')

    expect(
      await screen.findByText('검수 대기 강의가 없어요'),
    ).toBeInTheDocument()
    expect(screen.getByText('모두 처리함')).toHaveClass('pill', 'ok')
  })

  it('URL의 페이지가 마지막 페이지를 넘으면 마지막 페이지로 옮긴다', async () => {
    serveInspections({ PENDING_INSPECTION: [inspection()] }, 2)
    const router = renderApp('/admin/lectures?page=9', 'ADMIN')

    await waitFor(() => expect(router.state.location.search).toBe('?page=2'))
    expect(await screen.findByRole('link', { name: '검수하기' })).toBeVisible()
  })

  it('관리자 검수 화면은 회원에게 열리지 않는다', async () => {
    renderApp('/admin/lectures/1', 'USER')
    expect(await screen.findByText(/권한/)).toBeInTheDocument()
  })
})

describe('강의 검수 상세', () => {
  it('판매자·가격·등록일과 커리큘럼을 보여 주고 고른 강을 재생한다', async () => {
    serveDetail(detail())
    renderApp('/admin/lectures/1', 'ADMIN')

    expect(
      await screen.findByRole('heading', { name: '노래방송 저작권 기초' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('반주·원곡·커버의 저작권 범위를 정리해요.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← 강의 검수' })).toHaveAttribute(
      'href',
      '/admin/lectures',
    )
    const kv = screen.getByText('판매자').closest('dl') as HTMLElement
    expect(within(kv).getByText('새벽라디오 윤')).toBeInTheDocument()
    expect(within(kv).getByText(/11,000 HP/)).toBeInTheDocument()
    expect(
      within(kv).getByText(formatDate('2026-10-09T10:00:00')),
    ).toBeInTheDocument()

    // sequence 순으로 보여 주고 첫 강을 재생한다.
    const lessons = within(screen.getByRole('list', { name: '커리큘럼' }))
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(lessons).toEqual(['노래방송과 저작권 기초', '반주 음원 고르는 법'])
    await waitFor(() =>
      expect(document.querySelector('video')).toHaveAttribute(
        'src',
        'https://cdn.example/11',
      ),
    )

    await userEvent.click(
      screen.getByRole('button', { name: '반주 음원 고르는 법' }),
    )
    expect(
      await screen.findByRole('button', { name: '자료 내려받기' }),
    ).toBeInTheDocument()
  })

  it('체크리스트를 모두 체크해야 승인하고 공개 버튼이 켜진다', async () => {
    serveDetail(detail())
    renderApp('/admin/lectures/1', 'ADMIN')

    const approve = await screen.findByRole('button', { name: '승인하고 공개' })
    const items = [
      '소개와 실제 내용이 일치해요',
      '영상·음량 품질이 기준에 맞아요',
      '저작권 문제가 없어요',
      '개인정보가 노출되지 않아요',
    ]
    for (const label of items.slice(0, 3)) {
      await userEvent.click(screen.getByRole('checkbox', { name: label }))
    }
    expect(approve).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: items[3] }))
    expect(approve).toBeEnabled()
  })

  it('승인하면 토스트를 띄우고 목록으로 돌아간다', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    // 무효화로 다시 부른 상세는 판매 중이다. 그래도 목록으로 가야 한다.
    serveDetail(detail(), detail({ status: 'ON_SALE' }))
    serveInspections()
    let token: string | null = null
    server.use(
      http.post(
        '*/api/v1/lectures/admin/1/inspection/approve',
        ({ request }) => {
          token = request.headers.get('X-XSRF-TOKEN')
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )
    const router = renderApp('/admin/lectures/1', 'ADMIN')

    await screen.findByRole('button', { name: '승인하고 공개' })
    for (const box of screen.getAllByRole('checkbox')) {
      await userEvent.click(box)
    }
    await userEvent.click(screen.getByRole('button', { name: '승인하고 공개' }))

    expect(await screen.findByText('승인하고 공개했어요')).toBeInTheDocument()
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/lectures'),
    )
    expect(token).toBe('t')
  })

  it('반려 사유가 비어 있으면 반려할 수 없고 칩으로 사유를 채울 수 있다', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    serveDetail(
      detail(),
      detail({
        status: 'REJECTED',
        rejectionReason: '소개와 실제 내용이 달라요',
      }),
    )
    serveInspections()
    let body: unknown
    server.use(
      http.post(
        '*/api/v1/lectures/admin/1/inspection/reject',
        async ({ request }) => {
          body = await request.json()
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )
    const router = renderApp('/admin/lectures/1', 'ADMIN')

    const reject = await screen.findByRole('button', { name: '반려' })
    expect(reject).toBeDisabled()
    expect(screen.getByText('판매자에게 그대로 전달돼요.')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: '소개와 실제 내용이 달라요' }),
    )
    expect(screen.getByRole('textbox', { name: '반려 사유' })).toHaveValue(
      '소개와 실제 내용이 달라요',
    )
    await userEvent.click(reject)

    expect(
      await screen.findByText('반려했어요. 판매자에게 사유를 전달했어요.'),
    ).toBeInTheDocument()
    expect(body).toEqual({ reason: '소개와 실제 내용이 달라요' })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/lectures'),
    )
  })

  it('이미 처리된 강의면 409를 알리고 상세를 다시 불러온다', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    const calls = serveDetail(detail(), detail({ status: 'ON_SALE' }))
    server.use(
      http.post('*/api/v1/lectures/admin/1/inspection/approve', () =>
        HttpResponse.json(
          {
            status: 409,
            code: 'NOT_PENDING_INSPECTION',
            detail: '검수 대기 중인 강의가 아닙니다.',
          },
          { status: 409 },
        ),
      ),
    )
    const router = renderApp('/admin/lectures/1', 'ADMIN')

    await screen.findByRole('button', { name: '승인하고 공개' })
    for (const box of screen.getAllByRole('checkbox')) {
      await userEvent.click(box)
    }
    await userEvent.click(screen.getByRole('button', { name: '승인하고 공개' }))

    expect(
      await screen.findByText('이미 처리된 강의예요. 최신 상태를 불러왔어요.'),
    ).toBeInTheDocument()
    expect(await screen.findByText('승인 처리한 강의예요')).toBeInTheDocument()
    expect(calls()).toBe(2)
    expect(
      screen.queryByRole('button', { name: '승인하고 공개' }),
    ).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/lectures/1')
  })

  it('반려 뒤 다시 신청한 강의는 이전 반려 사유와 안내를 보여 준다', async () => {
    serveDetail(detail({ rejectionReason: '3강 음량이 낮아요' }))
    renderApp('/admin/lectures/1', 'ADMIN')

    expect(
      await screen.findByText('반려 뒤 다시 신청한 강의예요'),
    ).toBeInTheDocument()
    expect(screen.getByText('이전 반려 사유')).toBeInTheDocument()
    expect(screen.getByText('3강 음량이 낮아요')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '승인하고 공개' }),
    ).toBeInTheDocument()
  })

  it('반려한 강의는 처리 안내만 보이고 승인·반려할 수 없다', async () => {
    serveDetail(detail({ status: 'REJECTED', rejectionReason: '음량' }))
    renderApp('/admin/lectures/1', 'ADMIN')

    expect(await screen.findByText(/반려 처리한 강의예요/)).toBeInTheDocument()
    expect(screen.queryByText('반려 뒤 다시 신청한 강의예요')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: '반려' })).toBeNull()
  })

  it('삭제된 강의는 삭제됨으로 보이고 승인·반려할 수 없다', async () => {
    serveDetail(detail({ deleted: true }))
    renderApp('/admin/lectures/1', 'ADMIN')

    expect(await screen.findByText('삭제된 강의예요')).toBeInTheDocument()
    expect(screen.getByText('삭제됨')).toHaveClass('pill', 'mute')
    expect(
      screen.queryByRole('button', { name: '승인하고 공개' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '반려' })).toBeNull()
  })
})
