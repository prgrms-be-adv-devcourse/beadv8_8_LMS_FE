import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { inquiryKeys } from '@/entities/inquiry/api'
import type { Inquiry, InquirySummary } from '@/entities/inquiry/types'
import type { PurchasedLecture } from '@/entities/order/types'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import {
  expectFieldError,
  expectNoFieldError,
  expectSubmitBlocked,
  expectSubmitOpen,
} from '@/test/fieldError'
import { server } from '@/test/server'

const summary = (patch: Partial<InquirySummary> = {}): InquirySummary => ({
  inquiryId: 5,
  userId: ME_ID,
  category: 'SERVICE_COMPLAINT',
  title: '환전이 늦어요',
  status: 'WAITING',
  createdAt: '2026-10-14T10:00:00',
  ...patch,
})

const inquiry = (patch: Partial<Inquiry> = {}): Inquiry => ({
  ...summary(),
  content: '사흘째 환전이 안 돼요.',
  replies: [],
  targetType: null,
  targetId: null,
  objectionResult: null,
  objectionResolvedAt: null,
  objectionLinkStatus: null,
  hpReturnStatus: null,
  objectionNotice: null,
  objectionFailureCode: null,
  objectionCommandId: null,
  ...patch,
})

/** 강의에 접수된 이의 제기 문의(판단 전) */
const dispute = (patch: Partial<Inquiry> = {}): Inquiry =>
  inquiry({
    category: 'LECTURE_CONTENT_DISPUTE',
    title: '소개와 달라요',
    content: '3강이 없어요',
    targetType: 'LECTURE_ORDER_ITEM',
    targetId: 11,
    objectionLinkStatus: 'FILED',
    objectionCommandId: 'FILE:5',
    ...patch,
  })

const purchased = (patch: Partial<PurchasedLecture>): PurchasedLecture => ({
  lectureId: 1,
  orderId: 1,
  orderItemId: 11,
  title: '썸네일 강의',
  thumbnailUrl: null,
  itemStatus: 'CONFIRMED',
  lectureDeleted: false,
  purchasedAt: '2026-10-10T10:00:00',
  ...patch,
})

const page = <T,>(content: T[]) => ({
  content,
  page: { size: 10, number: 0, totalElements: content.length, totalPages: 1 },
})

/**
 * 페이지마다 "N페이지 문의" 한 건을 준다. Spring Page처럼 범위를 넘는 페이지에는 빈 content와 실제 totalPages를 준다.
 * totalPages()는 응답할 때마다 읽으므로 테스트 도중 목록을 줄일 수 있다.
 */
const pageOf = (request: Request, totalPages: () => number) => {
  const p = Number(new URL(request.url).searchParams.get('page'))
  return rs({
    content:
      p < totalPages()
        ? [
            summary({
              inquiryId: p + 1,
              userId: 7,
              title: `${p + 1}페이지 문의`,
            }),
          ]
        : [],
    page: {
      size: 10,
      number: p,
      totalElements: totalPages(),
      totalPages: totalPages(),
    },
  })
}

afterEach(() => queryClient.clear())

describe('고객센터 (회원)', () => {
  it('서비스 불만 문의를 접수하면 내 문의를 다시 부른다', async () => {
    let sent: unknown
    let list = [] as InquirySummary[]
    server.use(
      http.get('*/api/v1/inquiries', () => rs(page(list))),
      http.post('*/api/v1/inquiries', async ({ request }) => {
        sent = await request.json()
        list = [summary()]
        return rs(inquiry(), 201)
      }),
    )
    renderApp('/support', 'USER')

    expect(
      await screen.findByText('아직 남긴 문의가 없어요'),
    ).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: '접수하기' })
    expectSubmitBlocked(submit)
    await userEvent.type(screen.getByLabelText('제목'), '환전이 늦어요')
    await userEvent.type(
      screen.getByLabelText('내용'),
      '사흘째 환전이 안 돼요.',
    )
    await userEvent.click(submit)

    await waitFor(() =>
      expect(sent).toEqual({
        category: 'SERVICE_COMPLAINT',
        title: '환전이 늦어요',
        content: '사흘째 환전이 안 돼요.',
      }),
    )
    const row = await screen.findByRole('link', { name: /환전이 늦어요/ })
    expect(row).toHaveAttribute('href', '/support/inquiries/5')
    expect(
      within(row.parentElement!).getByText('답변 대기'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('제목')).toHaveValue('')
  })

  it('강의 내용 다름은 지급 전 구매 강의만 고를 수 있고 주문 항목을 함께 보낸다', async () => {
    let sent: unknown
    server.use(
      http.get('*/api/v1/inquiries', () => rs(page([]))),
      http.get('*/api/v1/lectures/purchased', () =>
        rs(
          page([
            purchased({ orderItemId: 11, title: '썸네일 강의' }),
            purchased({
              orderItemId: 12,
              title: '지급된 강의',
              itemStatus: 'PAID_OUT',
            }),
          ]),
        ),
      ),
      http.post('*/api/v1/inquiries', async ({ request }) => {
        sent = await request.json()
        return rs(inquiry(), 201)
      }),
    )
    renderApp(
      '/support?category=LECTURE_CONTENT_DISPUTE&orderItemId=11',
      'USER',
    )

    expect(await screen.findByLabelText('문의 유형')).toHaveValue(
      'LECTURE_CONTENT_DISPUTE',
    )
    expect(screen.getByText(/구매일 다음 날부터 30일/)).toBeInTheDocument()
    const target = await screen.findByLabelText('이의 제기할 강의')
    expect(target).toHaveValue('11')
    expect(within(target).queryByText(/지급된 강의/)).toBeNull()

    await userEvent.type(screen.getByLabelText('제목'), '소개와 달라요')
    await userEvent.type(screen.getByLabelText('내용'), '3강이 없어요')
    await userEvent.click(screen.getByRole('button', { name: '접수하기' }))
    await waitFor(() =>
      expect(sent).toEqual({
        category: 'LECTURE_CONTENT_DISPUTE',
        title: '소개와 달라요',
        content: '3강이 없어요',
        orderItemId: 11,
      }),
    )
  })

  it('이의 제기할 강의가 없으면 접수할 수 없다', async () => {
    server.use(
      http.get('*/api/v1/inquiries', () => rs(page([]))),
      http.get('*/api/v1/lectures/purchased', () => rs(page([]))),
    )
    renderApp('/support', 'USER')
    await userEvent.selectOptions(
      await screen.findByLabelText('문의 유형'),
      'LECTURE_CONTENT_DISPUTE',
    )
    expect(
      await screen.findByText(/이의 제기할 수 있는 강의가 없어요/),
    ).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('제목'), '제목')
    await userEvent.type(screen.getByLabelText('내용'), '내용')
    expectSubmitBlocked(screen.getByRole('button', { name: '접수하기' }))
  })

  it('제목을 비운 채 떠나면 제목에 오류를 보여 주고 접수를 막는다', async () => {
    server.use(http.get('*/api/v1/inquiries', () => rs(page([]))))
    renderApp('/support', 'USER')

    const title = await screen.findByLabelText('제목')
    const submit = screen.getByRole('button', { name: '접수하기' })
    expectNoFieldError(title)
    await userEvent.click(title)
    await userEvent.tab()

    expectFieldError(title, '제목을 입력해 주세요.')
    expectNoFieldError(screen.getByLabelText('내용'))
    expectSubmitBlocked(submit)
    await userEvent.type(title, '환전이 늦어요')
    expectNoFieldError(title)
    expectSubmitBlocked(submit)
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('막힌 접수하기를 누르거나 입력칸에서 Enter로 제출하면 보내지 않고 첫 오류 칸만 보여 주며 포커스한다', async () => {
    let posts = 0
    server.use(
      http.get('*/api/v1/inquiries', () => rs(page([]))),
      http.post('*/api/v1/inquiries', () => {
        posts++
        return rs(inquiry(), 201)
      }),
    )
    renderApp('/support', 'USER')

    const title = await screen.findByLabelText('제목')
    const content = screen.getByLabelText('내용')
    // Enter 제출(form submit)
    await userEvent.type(title, '환전이 늦어요{Enter}')
    expectFieldError(content, '내용을 입력해 주세요.')
    await waitFor(() => expect(content).toHaveFocus())
    expectNoFieldError(title)

    // 제목을 비우고 버튼 클릭: 화면 순서상 첫 오류는 제목
    await userEvent.clear(title)
    await userEvent.click(screen.getByRole('button', { name: '접수하기' }))
    expectFieldError(title, '제목을 입력해 주세요.')
    await waitFor(() => expect(title).toHaveFocus())
    expect(posts).toBe(0)
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('내 문의 검색어·정렬은 URL에 남고 미리 채우기 값은 그대로 둔다', async () => {
    const seen: string[] = []
    server.use(
      http.get('*/api/v1/inquiries', ({ request }) => {
        seen.push(new URL(request.url).search)
        return rs(page([summary()]))
      }),
    )
    const router = renderApp('/support?category=OTHER', 'USER')
    await screen.findByRole('link', { name: /환전이 늦어요/ })
    await userEvent.type(screen.getByLabelText('내 문의 검색'), '환전{Enter}')
    await userEvent.selectOptions(screen.getByLabelText('정렬'), 'OLDEST')
    await waitFor(() =>
      expect(seen.at(-1)).toBe(
        '?keyword=%ED%99%98%EC%A0%84&sort=OLDEST&page=0&size=10',
      ),
    )
    const params = new URLSearchParams(router.state.location.search)
    expect(Object.fromEntries(params)).toEqual({
      category: 'OTHER',
      q: '환전',
      sort: 'OLDEST',
    })
  })

  it('뒤로 가기로 검색 전 주소로 돌아가면 내 문의 검색창을 비우고, 앞으로 가면 되살린다', async () => {
    server.use(http.get('*/api/v1/inquiries', () => rs(page([summary()]))))
    const router = renderApp('/support', 'USER')
    await screen.findByRole('link', { name: /환전이 늦어요/ })
    await userEvent.type(screen.getByLabelText('내 문의 검색'), '환전{Enter}')
    await waitFor(() =>
      expect(new URLSearchParams(router.state.location.search).get('q')).toBe(
        '환전',
      ),
    )

    await act(() => router.navigate(-1))
    expect(screen.getByLabelText('내 문의 검색')).toHaveValue('')
    await act(() => router.navigate(1))
    expect(screen.getByLabelText('내 문의 검색')).toHaveValue('환전')
  })

  it('상세에서 돌아오면 보던 검색어·페이지로 다시 연다', async () => {
    const seen: string[] = []
    server.use(
      http.get('*/api/v1/inquiries', ({ request }) => {
        seen.push(new URL(request.url).search)
        return rs({
          content: [summary()],
          page: { size: 10, number: 1, totalElements: 11, totalPages: 2 },
        })
      }),
    )
    renderApp('/support?q=%ED%99%98%EC%A0%84&page=2', 'USER')
    await screen.findByRole('link', { name: /환전이 늦어요/ })
    expect(seen[0]).toBe(
      '?keyword=%ED%99%98%EC%A0%84&sort=LATEST&page=1&size=10',
    )
    expect(screen.getByLabelText('내 문의 검색')).toHaveValue('환전')
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('내 문의 페이지를 마지막 페이지로 옮겨도 검색어·정렬·미리 채우기 값은 남는다', async () => {
    server.use(
      http.get('*/api/v1/inquiries', ({ request }) => pageOf(request, () => 2)),
    )
    const router = renderApp(
      '/support?category=OTHER&q=%EB%AC%B8%EC%9D%98&sort=OLDEST&page=9',
      'USER',
    )

    expect(
      await screen.findByRole('link', { name: /2페이지 문의/ }),
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe(
      '?category=OTHER&q=%EB%AC%B8%EC%9D%98&sort=OLDEST&page=2',
    )
    expect(screen.queryByText('찾는 문의가 없어요')).not.toBeInTheDocument()
  })

  it('문의 상세는 답변을 보여 주고, 답변이 달리면 삭제할 수 없다', async () => {
    server.use(
      http.get('*/api/v1/inquiries/5', () =>
        rs(
          inquiry({
            status: 'ANSWERED',
            replies: [
              {
                replyId: 1,
                content: '확인해 볼게요.',
                createdAt: '2026-10-14T11:00:00',
              },
              {
                replyId: 2,
                content: '처리됐어요.',
                createdAt: '2026-10-14T12:00:00',
              },
            ],
          }),
        ),
      ),
    )
    renderApp('/support/inquiries/5', 'USER')
    expect(
      await screen.findByRole('heading', { name: '환전이 늦어요' }),
    ).toBeInTheDocument()
    const replies = screen.getAllByRole('article', { name: '운영팀 답변' })
    expect(
      replies.map((r) => within(r).getByText(/요\.$/).textContent),
    ).toEqual(['확인해 볼게요.', '처리됐어요.'])
    expect(screen.getByText('답변 완료')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '문의 삭제' })).toBeNull()
  })

  it('답변 대기 문의는 삭제하고 고객센터로 돌아간다', async () => {
    let deleted = false
    server.use(
      http.get('*/api/v1/inquiries/5', () => rs(inquiry())),
      http.get('*/api/v1/inquiries', () => rs(page([]))),
      http.delete('*/api/v1/inquiries/5', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const router = renderApp('/support/inquiries/5', 'USER')
    await userEvent.click(
      await screen.findByRole('button', { name: '문의 삭제' }),
    )
    const dialog = screen.getByRole('dialog', { name: '문의를 삭제할까요?' })
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/support'))
    expect(deleted).toBe(true)
    // 돌아간 고객센터가 목록을 다 받아 그려야 다음 테스트로 요청이 새지 않는다.
    // 주소는 화면보다 먼저 바뀌므로 주소만 보고 끝내면 목록 요청이 아직 나가지 않았을 수 있다.
    expect(
      await screen.findByText('아직 남긴 문의가 없어요'),
    ).toBeInTheDocument()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('이의 제기 판단 결과와 HP 반환 상태를 보여 준다', async () => {
    server.use(
      http.get('*/api/v1/inquiries/5', () =>
        rs(
          dispute({
            status: 'ANSWERED',
            objectionLinkStatus: 'RESOLVED',
            objectionCommandId: null,
            objectionResult: 'ACCEPTED',
            objectionResolvedAt: '2026-10-15T09:00:00',
            hpReturnStatus: 'ACTION_REQUIRED',
            replies: [
              {
                replyId: 1,
                content: '인정되어 반환해요.',
                createdAt: '2026-10-15T09:00:00',
              },
            ],
          }),
        ),
      ),
    )
    renderApp('/support/inquiries/5', 'USER')
    expect(
      await screen.findByText('이의 제기 인정 · 구매자 반환'),
    ).toBeInTheDocument()
    expect(screen.getByText('HP 반환 지연 · 확인 중')).toHaveClass(
      'pill',
      'bad',
    )
    expect(screen.getByText(/강의 주문 항목 #11/)).toBeInTheDocument()
    // 판단이 끝난 문의에는 지급 멈춤 안내를 보이지 않는다.
    expect(screen.queryByText(/판매자 지급이 멈춰요/)).toBeNull()
  })

  it('이의 제기 접수가 처리 중(202)이면 문의 상세에서 접수 처리 중을 보이고, 접수되면 판매자 지급 안내로 바뀐다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    let current = dispute({ objectionLinkStatus: 'FILING' })
    server.use(
      http.get('*/api/v1/inquiries', () => rs(page([]))),
      http.get('*/api/v1/lectures/purchased', () =>
        rs(page([purchased({ orderItemId: 11 })])),
      ),
      http.post('*/api/v1/inquiries', () => rs(current, 202)),
      http.get('*/api/v1/inquiries/5', () => rs(current)),
    )
    const router = renderApp(
      '/support?category=LECTURE_CONTENT_DISPUTE&orderItemId=11',
      'USER',
    )
    expect(await screen.findByLabelText('이의 제기할 강의')).toHaveValue('11')
    await userEvent.type(screen.getByLabelText('제목'), '소개와 달라요')
    await userEvent.type(screen.getByLabelText('내용'), '3강이 없어요')
    await userEvent.click(screen.getByRole('button', { name: '접수하기' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/support/inquiries/5'),
    )
    expect(
      await screen.findByText(/이의 제기 접수를 처리하고 있어요/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/판매자 지급이 멈춰요/)).toBeNull()
    expect(screen.queryByRole('button', { name: '문의 삭제' })).toBeNull()

    current = dispute()
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    expect(await screen.findByText(/판매자 지급이 멈춰요/)).toBeInTheDocument()
    expect(screen.queryByText(/이의 제기 접수를 처리하고 있어요/)).toBeNull()
    expect(
      screen.getByRole('button', { name: '문의 삭제' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('접수 불가 이의 제기는 서버 안내를 보이고 바로 삭제할 수 있다', async () => {
    let deleted = false
    server.use(
      http.get('*/api/v1/inquiries/5', () =>
        rs(
          dispute({
            objectionLinkStatus: 'FILE_REJECTED',
            objectionNotice: '접수 불가 · 이의 제기 기간이 지났습니다.',
          }),
        ),
      ),
      http.get('*/api/v1/inquiries', () => rs(page([]))),
      http.delete('*/api/v1/inquiries/5', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const router = renderApp('/support/inquiries/5', 'USER')

    expect(
      await screen.findByText('접수 불가 · 이의 제기 기간이 지났습니다.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/판매자 지급이 멈춰요/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '문의 삭제' }))
    const dialog = screen.getByRole('dialog', { name: '문의를 삭제할까요?' })
    expect(
      within(dialog).getByText('삭제한 문의는 되돌릴 수 없어요.'),
    ).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/support'))
    expect(deleted).toBe(true)
    expect(
      await screen.findByText('아직 남긴 문의가 없어요'),
    ).toBeInTheDocument()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('판단·철회가 처리 지연이면 서버 안내만 보이고 삭제할 수 없다', async () => {
    server.use(
      http.get('*/api/v1/inquiries/5', () =>
        rs(
          dispute({
            objectionLinkStatus: 'WITHDRAWAL_FAILED',
            objectionNotice: '처리 지연 · 확인 중',
          }),
        ),
      ),
    )
    renderApp('/support/inquiries/5', 'USER')

    expect(await screen.findByText('처리 지연 · 확인 중')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '문의 삭제' })).toBeNull()
    expect(
      screen.getByText(/처리하는 동안에는 문의를 삭제할 수 없어요/),
    ).toBeInTheDocument()
    // 회원 응답에는 실패 코드·명령 ID가 없고, 화면도 연동 상태 이름을 보이지 않는다.
    expect(screen.queryByText('철회 처리 지연')).toBeNull()
    expect(screen.queryByText(/FILE:5/)).toBeNull()
  })

  it('접수된 이의 제기를 삭제하면 철회 처리 중을 보이고, 철회가 끝나면 고객센터로 돌아간다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    let current: Inquiry | null = dispute()
    server.use(
      http.get('*/api/v1/inquiries/5', () =>
        current
          ? rs(current)
          : HttpResponse.json(
              {
                status: 404,
                code: 'INQUIRY_NOT_FOUND',
                detail: '문의를 찾을 수 없습니다.',
              },
              { status: 404 },
            ),
      ),
      http.get('*/api/v1/inquiries', () => rs(page([]))),
      http.delete('*/api/v1/inquiries/5', () => {
        current = dispute({ objectionLinkStatus: 'WITHDRAWAL_PENDING' })
        return rs(current, 202)
      }),
    )
    const router = renderApp('/support/inquiries/5', 'USER')

    await userEvent.click(
      await screen.findByRole('button', { name: '문의 삭제' }),
    )
    const dialog = screen.getByRole('dialog', { name: '문의를 삭제할까요?' })
    expect(within(dialog).getByText(/이의 제기를 철회해요/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }))

    expect(
      await screen.findByText(/이의 제기 철회를 처리하고 있어요/),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/support/inquiries/5')
    expect(screen.queryByRole('button', { name: '문의 삭제' })).toBeNull()
    expect(screen.queryByText(/판매자 지급이 멈춰요/)).toBeNull()

    // 강의가 철회를 반영해 문의가 지워졌다.
    current = null
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    await waitFor(() => expect(router.state.location.pathname).toBe('/support'))
    expect(
      await screen.findByText('이의 제기를 철회했어요.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('아직 남긴 문의가 없어요'),
    ).toBeInTheDocument()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })
})

describe('문의 답변 (관리자)', () => {
  it('기본은 답변 대기 · 오래된 순이고, 상태를 바꿀 수 있다', async () => {
    const seen: string[] = []
    server.use(
      http.get('*/api/v1/inquiries/admin', ({ request }) => {
        seen.push(new URL(request.url).search)
        return rs(page([summary({ userId: 7 })]))
      }),
    )
    const router = renderApp('/admin/inquiries', 'ADMIN')
    const row = await screen.findByRole('link', { name: /환전이 늦어요/ })
    expect(row).toHaveAttribute('href', '/admin/inquiries/5')
    expect(within(row).getByText(/회원 #7/)).toBeInTheDocument()
    expect(seen[0]).toBe('?status=WAITING&sort=OLDEST&page=0&size=10')

    await userEvent.click(screen.getByRole('button', { name: '전체' }))
    await waitFor(() => expect(seen.at(-1)).toBe('?sort=OLDEST&page=0&size=10'))
    expect(router.state.location.search).toBe('?status=ALL')
  })

  it('답변을 달고, 고치고, 지운다', async () => {
    let current = inquiry()
    const calls: string[] = []
    server.use(
      http.get('*/api/v1/inquiries/admin/5', () => rs(current)),
      http.post('*/api/v1/inquiries/admin/5/replies', async ({ request }) => {
        const { content } = (await request.json()) as { content: string }
        calls.push(`POST ${content}`)
        current = inquiry({
          status: 'ANSWERED',
          replies: [{ replyId: 9, content, createdAt: '2026-10-15T09:00:00' }],
        })
        return rs(current, 201)
      }),
      http.put('*/api/v1/inquiries/admin/5/replies/9', async ({ request }) => {
        const { content } = (await request.json()) as { content: string }
        calls.push(`PUT ${content}`)
        current = { ...current, replies: [{ ...current.replies[0], content }] }
        return rs(current)
      }),
      http.delete('*/api/v1/inquiries/admin/5/replies/9', () => {
        calls.push('DELETE')
        current = inquiry()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/admin/inquiries/5', 'ADMIN')

    await userEvent.type(await screen.findByLabelText('답변'), '확인 중이에요')
    await userEvent.click(screen.getByRole('button', { name: '답변 달기' }))
    const reply = await screen.findByRole('article', { name: '운영팀 답변' })
    expect(within(reply).getByText('확인 중이에요')).toBeInTheDocument()

    await userEvent.click(within(reply).getByRole('button', { name: '고치기' }))
    const box = within(reply).getByLabelText('답변 고치기')
    await userEvent.clear(box)
    await userEvent.type(box, '처리했어요')
    await userEvent.click(within(reply).getByRole('button', { name: '저장' }))
    const edited = await screen.findByRole('article', { name: '운영팀 답변' })
    expect(await within(edited).findByText('처리했어요')).toBeInTheDocument()

    await userEvent.click(within(edited).getByRole('button', { name: '삭제' }))
    const dialog = screen.getByRole('dialog', { name: '답변을 삭제할까요?' })
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }))
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: '운영팀 답변' })).toBeNull(),
    )
    expect(calls).toEqual(['POST 확인 중이에요', 'PUT 처리했어요', 'DELETE'])
  })

  it('답변을 비운 채 떠나면 오류를 보여 주고 답변 달기를 막는다', async () => {
    server.use(http.get('*/api/v1/inquiries/admin/5', () => rs(inquiry())))
    renderApp('/admin/inquiries/5', 'ADMIN')

    const box = await screen.findByLabelText('답변')
    expectNoFieldError(box)
    await userEvent.click(box)
    await userEvent.tab()

    expectFieldError(box, '답변을 입력해 주세요.')
    expectSubmitBlocked(screen.getByRole('button', { name: '답변 달기' }))
    await userEvent.type(box, '확인 중이에요')
    expectNoFieldError(box)
    expectSubmitOpen(screen.getByRole('button', { name: '답변 달기' }))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('이의 제기 판단 안내를 비운 채 떠나면 오류를 보여 주고 판단을 막는다', async () => {
    server.use(http.get('*/api/v1/inquiries/admin/5', () => rs(dispute())))
    renderApp('/admin/inquiries/5', 'ADMIN')

    const box = await screen.findByLabelText('판단 안내')
    await userEvent.click(screen.getByLabelText(/인정 · 구매자 반환/))
    await userEvent.click(box)
    await userEvent.tab()

    expectFieldError(box, '판단 안내를 입력해 주세요.')
    expectSubmitBlocked(screen.getByRole('button', { name: '판단하기' }))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('판단 전 이의 제기는 인정·기각과 안내를 함께 보낸다', async () => {
    let sent: unknown
    let current = dispute()
    server.use(
      http.get('*/api/v1/inquiries/admin/5', () => rs(current)),
      // 이미 반영된 같은 판단을 다시 보낸 것처럼 바로 반영된 결과(200)를 준다.
      http.post(
        '*/api/v1/inquiries/admin/5/objection-resolution',
        async ({ request }) => {
          sent = await request.json()
          current = {
            ...current,
            status: 'ANSWERED',
            objectionLinkStatus: 'RESOLVED',
            objectionCommandId: 'RESOLVE:5',
            objectionResult: 'REJECTED',
            objectionResolvedAt: '2026-10-15T09:00:00',
            replies: [
              {
                replyId: 1,
                content: '소개와 같아요',
                createdAt: '2026-10-15T09:00:00',
              },
            ],
          }
          return rs(current)
        },
      ),
    )
    renderApp('/admin/inquiries/5', 'ADMIN')

    expect(
      await screen.findByRole('heading', { name: '이의 제기 판단' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '답변 달기' })).toBeNull()
    const decide = screen.getByRole('button', { name: '판단하기' })
    expectSubmitBlocked(decide)
    await userEvent.click(screen.getByLabelText('기각 · 판매자 지급'))
    await userEvent.type(screen.getByLabelText('판단 안내'), '소개와 같아요')
    await userEvent.click(decide)
    const dialog = screen.getByRole('dialog', {
      name: '이의 제기를 기각할까요?',
    })
    await userEvent.click(within(dialog).getByRole('button', { name: '기각' }))

    await waitFor(() =>
      expect(sent).toEqual({ accepted: false, content: '소개와 같아요' }),
    )
    expect(
      await screen.findByText('이의 제기 기각 · 판매자 지급'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '이의 제기 판단' })).toBeNull()
    expect(
      screen.getByRole('button', { name: '답변 달기' }),
    ).toBeInTheDocument()
  })

  it('판단이 처리 중(202)이면 판단 폼을 닫고 판단 처리 중을 보이다가, 반영되면 결과와 HP 반환 상태를 보인다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    let current = dispute()
    server.use(
      http.get('*/api/v1/inquiries/admin/5', () => rs(current)),
      http.post('*/api/v1/inquiries/admin/5/objection-resolution', () => {
        current = dispute({
          objectionLinkStatus: 'RESOLUTION_PENDING',
          objectionCommandId: 'RESOLVE:5',
        })
        return rs(current, 202)
      }),
    )
    renderApp('/admin/inquiries/5', 'ADMIN')

    await userEvent.click(await screen.findByLabelText('인정 · 구매자 반환'))
    await userEvent.type(screen.getByLabelText('판단 안내'), '3강이 빠졌어요')
    await userEvent.click(screen.getByRole('button', { name: '판단하기' }))
    const dialog = screen.getByRole('dialog', {
      name: '이의 제기를 인정할까요?',
    })
    await userEvent.click(within(dialog).getByRole('button', { name: '인정' }))

    const link = () => screen.getByRole('region', { name: '이의 제기 연동' })
    expect(await within(link()).findByText('판단 처리 중')).toHaveClass(
      'pill',
      'warn',
    )
    expect(within(link()).getByText('RESOLVE:5')).toBeInTheDocument()
    expect(screen.getByText(/판단을 보냈어요/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '이의 제기 판단' })).toBeNull()
    expect(screen.queryByRole('button', { name: '답변 달기' })).toBeNull()
    expect(screen.queryByText(/이의 제기 인정 · 구매자 반환/)).toBeNull()

    current = dispute({
      status: 'ANSWERED',
      objectionLinkStatus: 'RESOLVED',
      objectionCommandId: 'RESOLVE:5',
      objectionResult: 'ACCEPTED',
      objectionResolvedAt: '2026-10-15T09:00:00',
      hpReturnStatus: 'PENDING',
      replies: [
        {
          replyId: 1,
          content: '3강이 빠졌어요',
          createdAt: '2026-10-15T09:00:00',
        },
      ],
    })
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    expect(
      await screen.findByText('이의 제기 인정 · 구매자 반환'),
    ).toBeInTheDocument()
    expect(within(link()).getByText('판단 완료')).toBeInTheDocument()
    expect(screen.getByText('HP 반환 처리 중')).toHaveClass('pill', 'warn')
    expect(
      screen.getByRole('button', { name: '답변 달기' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('판단 처리 지연이면 실패 코드와 명령 ID를 보이고, 판단·답변 폼을 열지 않으며 다시 부르지 않는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    let calls = 0
    server.use(
      http.get('*/api/v1/inquiries/admin/5', () => {
        calls++
        return rs(
          dispute({
            objectionLinkStatus: 'RESOLUTION_FAILED',
            objectionFailureCode: 'OBJECTION_NOT_FILED',
            objectionCommandId: 'RESOLVE:5',
            objectionNotice: '처리 지연 · 확인 중',
          }),
        )
      }),
    )
    renderApp('/admin/inquiries/5', 'ADMIN')

    const link = await screen.findByRole('region', { name: '이의 제기 연동' })
    expect(within(link).getByText('판단 처리 지연')).toHaveClass('pill', 'bad')
    expect(within(link).getByText('OBJECTION_NOT_FILED')).toBeInTheDocument()
    expect(within(link).getByText('RESOLVE:5')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '이의 제기 판단' })).toBeNull()
    expect(screen.queryByRole('button', { name: '답변 달기' })).toBeNull()

    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    const before = calls
    await act(() => vi.advanceTimersByTimeAsync(20_000))
    expect(calls).toBe(before)
  })

  it('철회 처리 중 문의는 답변 폼을 열지 않고, 철회되어 사라지면 삭제됐다고 알린다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    let current: Inquiry | null = dispute({
      objectionLinkStatus: 'WITHDRAWAL_PENDING',
      objectionCommandId: 'WITHDRAW:5',
    })
    server.use(
      http.get('*/api/v1/inquiries/admin/5', () =>
        current
          ? rs(current)
          : HttpResponse.json(
              {
                status: 404,
                code: 'INQUIRY_NOT_FOUND',
                detail: '문의를 찾을 수 없습니다.',
              },
              { status: 404 },
            ),
      ),
    )
    renderApp('/admin/inquiries/5', 'ADMIN')

    const link = await screen.findByRole('region', { name: '이의 제기 연동' })
    expect(within(link).getByText('철회 처리 중')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '이의 제기 판단' })).toBeNull()
    expect(screen.queryByRole('button', { name: '답변 달기' })).toBeNull()

    current = null
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    expect(
      await screen.findByText(/회원이 이의 제기를 철회해 문의가 삭제됐어요/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '문의 목록' })).toHaveAttribute(
      'href',
      '/admin/inquiries',
    )
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('상태·정렬 필터가 있어도 URL의 페이지가 마지막 페이지를 넘으면 마지막 페이지로 옮긴다', async () => {
    server.use(
      http.get('*/api/v1/inquiries/admin', ({ request }) =>
        pageOf(request, () => 2),
      ),
    )
    const router = renderApp(
      '/admin/inquiries?status=ALL&sort=LATEST&page=9',
      'ADMIN',
    )

    expect(
      await screen.findByRole('link', { name: /2페이지 문의/ }),
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe('?status=ALL&sort=LATEST&page=2')
    expect(screen.queryByText('문의가 없어요')).not.toBeInTheDocument()
  })

  it('다시 불렀더니 보던 마지막 페이지가 사라지면 앞 페이지로 옮긴다', async () => {
    let totalPages = 2
    server.use(
      http.get('*/api/v1/inquiries/admin', ({ request }) =>
        pageOf(request, () => totalPages),
      ),
    )
    const router = renderApp('/admin/inquiries?sort=LATEST&page=2', 'ADMIN')
    expect(
      await screen.findByRole('link', { name: /2페이지 문의/ }),
    ).toBeInTheDocument()

    // 다른 관리자가 2페이지의 마지막 문의에 답해 답변 대기 목록이 한 페이지로 줄었다.
    totalPages = 1
    void queryClient.invalidateQueries({ queryKey: inquiryKeys.all })

    expect(
      await screen.findByRole('link', { name: /1페이지 문의/ }),
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe('?sort=LATEST')
    expect(
      screen.queryByText('답변 대기 문의가 없어요'),
    ).not.toBeInTheDocument()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('관리자 문의 화면은 회원에게 열리지 않는다', async () => {
    renderApp('/admin/inquiries/5', 'USER')
    expect(await screen.findByText(/권한|볼 수 없/)).toBeInTheDocument()
  })
})
