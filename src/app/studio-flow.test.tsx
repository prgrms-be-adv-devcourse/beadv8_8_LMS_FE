import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { MyLecture, Sale } from '@/entities/lecture/types'
import { formatDate } from '@/shared/lib/date'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const myLecture = (overrides: Partial<MyLecture>): MyLecture => ({
  lectureId: 1,
  title: '통기타 라이브 세팅',
  priceHp: 16000,
  thumbnailUrl: null,
  status: 'ON_SALE',
  rejectionReason: null,
  deleted: false,
  inspectionRequestedAt: '2026-10-01T10:00:00',
  inspectedAt: '2026-10-02T10:00:00',
  createdAt: '2026-10-01T10:00:00',
  ...overrides,
})

const sale = (overrides: Partial<Sale>): Sale => ({
  orderItemId: 1,
  lectureId: 1,
  lectureTitle: '통기타 라이브 세팅',
  priceHp: 16000,
  status: 'PURCHASED',
  purchasedAt: '2026-10-11T14:00:00',
  payoutScheduledAt: '2026-11-11T00:00:00',
  paidOutAt: null,
  objectionStatus: 'NONE',
  ...overrides,
})

const page = <T,>(content: T[], number = 0, totalPages = 1) => ({
  content,
  page: { size: 20, number, totalElements: content.length, totalPages },
})

/** 내 강의·판매 내역 응답을 정한다. 요청한 page 값을 모아 돌려준다. */
function serveStudio({
  lectures = [] as MyLecture[] | (() => MyLecture[]),
  sales = [] as Sale[],
  totalPages = 1,
} = {}) {
  const requested = { lectures: [] as string[], sales: [] as string[] }
  server.use(
    http.get('*/api/v1/lectures/me', ({ request }) => {
      const p = new URL(request.url).searchParams.get('page') ?? ''
      requested.lectures.push(p)
      const content = typeof lectures === 'function' ? lectures() : lectures
      return rs(page(content, Number(p), totalPages))
    }),
    http.get('*/api/v1/lectures/sales', ({ request }) => {
      const p = new URL(request.url).searchParams.get('page') ?? ''
      requested.sales.push(p)
      return rs(page(sales, Number(p), totalPages))
    }),
  )
  return requested
}

/** 내 강의 목록에서 제목으로 한 줄을 찾는다. */
async function lectureRow(title: string) {
  const link = await screen.findByRole('link', { name: title })
  return link.closest('.row-item') as HTMLElement
}

afterEach(() => {
  queryClient.clear()
})

describe('강의 판매 화면', () => {
  it('머리글과 강의 등록 버튼을 보여 준다', async () => {
    serveStudio()
    renderApp('/studio', 'VERIFIED_INFLUENCER')

    expect(
      await screen.findByRole('heading', { name: '강의 판매' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '강의 등록' })).toHaveAttribute(
      'href',
      '/studio/lectures/new',
    )
  })

  it('내 강의를 상태 Pill·가격·반려 사유와 함께 보여 준다', async () => {
    serveStudio({
      lectures: [
        myLecture({ lectureId: 1, title: '판매 중 강의' }),
        myLecture({
          lectureId: 2,
          title: '검수 대기 강의',
          status: 'PENDING_INSPECTION',
          priceHp: 11000,
        }),
        myLecture({
          lectureId: 3,
          title: '반려 강의',
          status: 'REJECTED',
          rejectionReason: '3강 음량이 너무 작아요.',
        }),
        myLecture({ lectureId: 4, title: '삭제한 강의', deleted: true }),
      ],
    })
    renderApp('/studio', 'VERIFIED_INFLUENCER')

    const onSale = await lectureRow('판매 중 강의')
    expect(within(onSale).getByText('판매 중')).toHaveClass('pill', 'ok')
    expect(within(onSale).getByText('16,000 HP')).toBeInTheDocument()
    expect(
      within(onSale).getByRole('link', { name: '판매 중 강의' }),
    ).toHaveAttribute('href', '/lectures/1')

    const pending = await lectureRow('검수 대기 강의')
    expect(within(pending).getByText('검수 대기')).toHaveClass('pill', 'warn')
    expect(within(pending).getByText('11,000 HP')).toBeInTheDocument()

    const rejected = await lectureRow('반려 강의')
    expect(within(rejected).getByText('반려')).toHaveClass('pill', 'bad')
    expect(
      within(rejected).getByText('반려 사유: 3강 음량이 너무 작아요.'),
    ).toBeInTheDocument()

    // deleted가 true이면 status보다 삭제됨이 우선한다.
    const deleted = await lectureRow('삭제한 강의')
    expect(within(deleted).getByText('삭제됨')).toHaveClass('pill', 'mute')
    expect(within(deleted).queryByText('판매 중')).not.toBeInTheDocument()
    expect(deleted).toHaveClass('off')
  })

  it('삭제하지 않은 강의에만 수정·삭제 버튼을 두고 반려된 강의는 수정 후 재검수로 보여 준다', async () => {
    serveStudio({
      lectures: [
        myLecture({ lectureId: 1, title: '판매 중 강의' }),
        myLecture({ lectureId: 3, title: '반려 강의', status: 'REJECTED' }),
        myLecture({ lectureId: 4, title: '삭제한 강의', deleted: true }),
      ],
    })
    renderApp('/studio', 'VERIFIED_INFLUENCER')

    const onSale = await lectureRow('판매 중 강의')
    expect(within(onSale).getByRole('link', { name: '수정' })).toHaveAttribute(
      'href',
      '/studio/lectures/1/edit',
    )
    expect(
      within(onSale).getByRole('button', { name: '삭제' }),
    ).toBeInTheDocument()

    const rejected = await lectureRow('반려 강의')
    expect(
      within(rejected).getByRole('link', { name: '수정 후 재검수' }),
    ).toHaveAttribute('href', '/studio/lectures/3/edit')

    const deleted = await lectureRow('삭제한 강의')
    expect(
      within(deleted).queryByRole('link', { name: /수정/ }),
    ).not.toBeInTheDocument()
    expect(within(deleted).queryByRole('button')).not.toBeInTheDocument()
  })

  it('삭제를 확인하면 DELETE를 보내고 내 강의를 다시 불러온다', async () => {
    let deleted = false
    let csrf: string | null = null
    serveStudio({
      lectures: () => [
        myLecture({ lectureId: 1, title: '판매 중 강의', deleted }),
      ],
    })
    server.use(
      http.delete('*/api/v1/lectures/1', ({ request }) => {
        csrf = request.headers.get('X-XSRF-TOKEN')
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    document.cookie = 'XSRF-TOKEN=t'
    renderApp('/studio', 'VERIFIED_INFLUENCER')

    const row = await lectureRow('판매 중 강의')
    await userEvent.click(within(row).getByRole('button', { name: '삭제' }))
    const dialog = await screen.findByRole('dialog', {
      name: '강의를 삭제할까요?',
    })
    expect(within(dialog).getByText('판매 중 강의')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        '목록 노출과 신규 판매만 멈추고, 기존 구매자는 계속 볼 수 있어요. 지급은 예정대로 진행돼요.',
      ),
    ).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }))

    expect(
      await screen.findByText('강의를 삭제했어요. 목록에서 내려갔어요.'),
    ).toBeInTheDocument()
    expect(csrf).toBe('t')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      await within(await lectureRow('판매 중 강의')).findByText('삭제됨'),
    ).toBeInTheDocument()
  })

  it('삭제에 실패하면 BE 메시지를 토스트로 보여 주고 모달을 남긴다', async () => {
    serveStudio({
      lectures: [myLecture({ lectureId: 1, title: '판매 중 강의' })],
    })
    server.use(
      http.delete('*/api/v1/lectures/1', () =>
        HttpResponse.json(
          {
            status: 403,
            code: 'NOT_LECTURE_SELLER',
            detail: '강의 판매자만 처리할 수 있습니다.',
          },
          { status: 403 },
        ),
      ),
    )
    document.cookie = 'XSRF-TOKEN=t'
    renderApp('/studio', 'VERIFIED_INFLUENCER')

    const row = await lectureRow('판매 중 강의')
    await userEvent.click(within(row).getByRole('button', { name: '삭제' }))
    const dialog = await screen.findByRole('dialog', {
      name: '강의를 삭제할까요?',
    })
    await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }))

    expect(
      await screen.findByText('강의 판매자만 처리할 수 있습니다.'),
    ).toBeInTheDocument()
    expect(dialog).toBeInTheDocument()
  })

  it('판매 내역을 상태에 따라 지급 예정·이의 제기 중·반환·지급 완료로 보여 준다', async () => {
    serveStudio({
      sales: [
        sale({ orderItemId: 1, lectureTitle: '예정 강의' }),
        sale({
          orderItemId: 2,
          lectureTitle: '이의 강의',
          status: 'CONFIRMED',
          objectionStatus: 'FILED',
        }),
        sale({ orderItemId: 3, lectureTitle: '취소 강의', status: 'CANCELED' }),
        sale({
          orderItemId: 4,
          lectureTitle: '반환 강의',
          status: 'RETURNED',
          objectionStatus: 'ACCEPTED',
        }),
        sale({
          orderItemId: 5,
          lectureTitle: '지급 강의',
          status: 'PAID_OUT',
          paidOutAt: '2026-11-11T03:00:00',
        }),
      ],
    })
    renderApp('/studio', 'VERIFIED_INFLUENCER')

    const table = await screen.findByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['구매일', '강의', '금액', '지급 예정일', '상태'])

    const row = (title: string) =>
      within(table).getByRole('row', { name: new RegExp(title) })
    const purchased = formatDate('2026-10-11T14:00:00')
    const payout = formatDate('2026-11-11T00:00:00')

    const scheduled = row('예정 강의')
    expect(within(scheduled).getByText(purchased)).toBeInTheDocument()
    expect(within(scheduled).getByText('16,000')).toBeInTheDocument()
    expect(within(scheduled).getByText(payout)).toBeInTheDocument()
    expect(within(scheduled).getByText('지급 예정')).toHaveClass('pill', 'warn')

    expect(within(row('이의 강의')).getByText('이의 제기 중')).toHaveClass(
      'pill',
      'warn',
    )

    const canceled = row('취소 강의')
    expect(within(canceled).getByText('구매 취소 · 반환')).toHaveClass(
      'pill',
      'mute',
    )
    expect(within(canceled).getByText('—')).toBeInTheDocument()
    expect(within(canceled).queryByText(payout)).not.toBeInTheDocument()

    const returned = row('반환 강의')
    expect(within(returned).getByText('이의 제기 인정 · 반환')).toHaveClass(
      'pill',
      'info',
    )
    expect(within(returned).getByText('—')).toBeInTheDocument()

    const paid = row('지급 강의')
    expect(within(paid).getByText('지급 완료')).toHaveClass('pill', 'ok')
    expect(
      within(paid).getByText(`${formatDate('2026-11-11T03:00:00')} 지급`),
    ).toBeInTheDocument()
  })

  it('두 목록의 페이지를 page와 salesPage로 따로 넘긴다', async () => {
    const requested = serveStudio({
      lectures: [myLecture({ title: '판매 중 강의' })],
      sales: [sale({ lectureTitle: '판매 중 강의' })],
      totalPages: 3,
    })
    const router = renderApp('/studio?page=2', 'VERIFIED_INFLUENCER')

    const salesPanel = (
      await screen.findByRole('heading', { name: '판매 내역' })
    ).closest('section') as HTMLElement
    await within(salesPanel).findByRole('table')
    await userEvent.click(
      within(salesPanel).getByRole('button', { name: '다음' }),
    )

    await waitFor(() => expect(requested.sales).toContain('1'))
    expect(router.state.location.search).toBe('?page=2&salesPage=2')
    expect(requested.lectures).toEqual(['1'])
    expect(requested.sales[0]).toBe('0')
  })

  it('URL의 페이지가 마지막 페이지를 넘으면 마지막 페이지로 옮긴다', async () => {
    // Spring Page는 범위를 넘는 페이지에 빈 content와 실제 totalPages를 준다.
    const respond = <T,>(request: Request, item: T) => {
      const p = Number(new URL(request.url).searchParams.get('page'))
      return rs({
        content: p < 2 ? [item] : [],
        page: { size: 20, number: p, totalElements: 21, totalPages: 2 },
      })
    }
    server.use(
      http.get('*/api/v1/lectures/me', ({ request }) =>
        respond(request, myLecture({ title: '둘째 페이지 강의' })),
      ),
      http.get('*/api/v1/lectures/sales', ({ request }) =>
        respond(request, sale({ lectureTitle: '둘째 페이지 판매' })),
      ),
    )
    const router = renderApp(
      '/studio?page=9&salesPage=9',
      'VERIFIED_INFLUENCER',
    )

    expect(
      await screen.findByRole('link', { name: '둘째 페이지 강의' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('둘째 페이지 판매')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?page=2&salesPage=2')
    expect(screen.queryByText('등록한 강의가 없어요')).not.toBeInTheDocument()
  })

  it('강의와 판매 내역이 없으면 빈 상태를 보여 준다', async () => {
    serveStudio()
    renderApp('/studio', 'VERIFIED_INFLUENCER')

    expect(await screen.findByText('등록한 강의가 없어요')).toBeInTheDocument()
    expect(
      await screen.findByText('아직 판매 내역이 없어요'),
    ).toBeInTheDocument()
  })
})
