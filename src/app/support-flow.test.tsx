import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { inquiryKeys } from '@/entities/inquiry/api'
import type { Inquiry, InquirySummary } from '@/entities/inquiry/types'
import type { PurchasedLecture } from '@/entities/order/types'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
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
    expect(submit).toBeDisabled()
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
    expect(screen.getByRole('button', { name: '접수하기' })).toBeDisabled()
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

  it('이의 제기 판단 결과를 보여 준다', async () => {
    server.use(
      http.get('*/api/v1/inquiries/5', () =>
        rs(
          inquiry({
            category: 'LECTURE_CONTENT_DISPUTE',
            status: 'ANSWERED',
            targetType: 'LECTURE_ORDER_ITEM',
            targetId: 11,
            objectionResult: 'ACCEPTED',
            objectionResolvedAt: '2026-10-15T09:00:00',
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
    expect(screen.getByText(/강의 주문 항목 #11/)).toBeInTheDocument()
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

  it('판단 전 이의 제기는 인정·기각과 안내를 함께 보낸다', async () => {
    let sent: unknown
    let current = inquiry({
      category: 'LECTURE_CONTENT_DISPUTE',
      targetType: 'LECTURE_ORDER_ITEM',
      targetId: 11,
    })
    server.use(
      http.get('*/api/v1/inquiries/admin/5', () => rs(current)),
      http.post(
        '*/api/v1/inquiries/admin/5/objection-resolution',
        async ({ request }) => {
          sent = await request.json()
          current = {
            ...current,
            status: 'ANSWERED',
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
    expect(decide).toBeDisabled()
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
