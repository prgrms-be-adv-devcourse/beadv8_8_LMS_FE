import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { orderQuery, purchasedQuery } from '@/entities/order/api'
import type { LectureDetail, LectureSummary } from '@/entities/lecture/types'
import type {
  Order,
  OrderItemStatus,
  OrderStatus,
  ProcessingStatus,
} from '@/entities/order/types'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { mockOrders } from '@/test/lectureOrders'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const summary = (
  id: number,
  title: string,
  priceHp: number,
): LectureSummary => ({
  lectureId: id,
  title,
  priceHp,
  thumbnailUrl: null,
  sellerUserId: 99,
  sellerNickname: '하루',
  averageRating: null,
  reviewCount: 0,
})

const detail: LectureDetail = {
  lectureId: 7,
  sellerUserId: 99,
  sellerNickname: '하루',
  title: '첫 방송 세팅',
  description: '장비부터 OBS까지',
  priceHp: 30000,
  thumbnailUrl: null,
  thumbnailFileId: null,
  status: 'ON_SALE',
  rejectionReason: null,
  deleted: false,
  averageRating: null,
  reviewCount: 0,
  contents: [
    {
      contentId: 71,
      fileId: null,
      title: '장비 고르기',
      sequence: 1,
      contentType: 'VIDEO',
    },
    {
      contentId: 72,
      fileId: null,
      title: '체크리스트',
      sequence: 2,
      contentType: 'DOCUMENT',
    },
  ],
  createdAt: '2026-10-01T10:00:00',
}

const emptyPage = {
  content: [],
  page: { size: 20, number: 0, totalElements: 0, totalPages: 0 },
}

/** 강의 7을 산 주문 1건. 기본은 구매 확정 전(PURCHASED)이다. */
function purchasedOrder(status: OrderItemStatus = 'PURCHASED'): Order {
  return {
    orderId: 500,
    totalAmountHp: 30000,
    status: 'PAID',
    progress: 'IN_PROGRESS',
    processingStatus: null,
    orderedAt: '2026-10-14T10:00:00',
    paidAt: '2026-10-14T10:00:00',
    canceledAt: null,
    items: [
      {
        orderItemId: 501,
        lectureId: 7,
        lectureTitle: '첫 방송 세팅',
        priceHp: 30000,
        status,
        processingStatus: null,
        purchasedAt: '2026-10-14T10:00:00',
        confirmedAt: null,
        confirmationType: null,
        autoConfirmAt: '2999-10-22T00:00:00',
        payoutScheduledAt: '2999-11-14T00:00:00',
        canceledAt: null,
        returnedAt: null,
        objectionStatus: 'NONE',
      },
    ],
  }
}

/** 강의 7 주문이 결제 단계(처리 중·실패)에 있다. 항목은 주문과 같은 상태이고 기한이 없다. */
function holdOrder(
  status: Extract<OrderStatus, `HOLD_${string}`>,
  processingStatus: ProcessingStatus | null = status === 'HOLD_FAILED'
    ? null
    : 'PROCESSING',
): Order {
  const paid = purchasedOrder()
  return {
    ...paid,
    status,
    progress: null,
    processingStatus,
    paidAt: null,
    items: paid.items.map((item) => ({
      ...item,
      status,
      processingStatus,
      purchasedAt: null,
      autoConfirmAt: null,
      payoutScheduledAt: null,
    })),
  }
}

/** 주문 하나를 다른 번호·강의로 바꾼다. 항목 번호는 주문 번호 + 1, 강의 ID는 주문 번호다 */
function numbered(order: Order, orderId: number, title: string): Order {
  return {
    ...order,
    orderId,
    items: order.items.map((item) => ({
      ...item,
      orderItemId: orderId + 1,
      lectureId: orderId,
      lectureTitle: title,
    })),
  }
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

/** 강의 7을 바로 구매한다. 주문 요청에는 order를 status로 응답한다 */
async function buyNow(order: Order, status: number) {
  mockLectureDetail()
  let orders: ReturnType<typeof mockOrders> | undefined
  server.use(
    http.post('*/api/v1/lectures/orders', () => {
      orders = mockOrders(order)
      return rs(order, status)
    }),
  )
  renderApp('/lectures/7', 'USER', { availableTotalHp: 130000 })
  await userEvent.click(
    await screen.findByRole('button', { name: '바로 구매' }),
  )
  const dialog = await screen.findByRole('dialog', { name: '주문 확인' })
  await userEvent.click(
    within(dialog).getByRole('button', { name: '30,000 HP 결제' }),
  )
  return () => orders!
}

function mockLectureDetail() {
  server.use(
    http.get('*/api/v1/lectures/7', () => rs(detail)),
    http.get('*/api/v1/lectures/cart', () =>
      rs({ items: [], purchasableTotalHp: 0 }),
    ),
    http.get('*/api/v1/lectures/7/reviews', () => rs(emptyPage)),
  )
}

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('강의 목록', () => {
  it('정렬을 바꾸면 URL과 요청에 반영한다', async () => {
    const sorts: (string | null)[] = []
    server.use(
      http.get('*/api/v1/lectures', ({ request }) => {
        sorts.push(new URL(request.url).searchParams.get('sort'))
        return rs({
          content: [
            summary(1, '썸네일 잘 만들기', 12000),
            summary(2, '마이크 세팅', 9000),
          ],
          page: { size: 12, number: 0, totalElements: 2, totalPages: 1 },
        })
      }),
      http.get('*/api/v1/lectures/purchased', () => rs(emptyPage)),
      http.get('*/api/v1/lectures/cart', () =>
        rs({ items: [], purchasableTotalHp: 0 }),
      ),
    )
    const router = renderApp('/lectures', 'USER')
    expect(
      await screen.findByRole('link', { name: /썸네일 잘 만들기/ }),
    ).toBeInTheDocument()

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '정렬' }),
      'PRICE_ASC',
    )
    await waitFor(() => expect(sorts).toContain('PRICE_ASC'))
    expect(router.state.location.search).toBe('?sort=PRICE_ASC')
  })

  it('뒤로 가기로 검색 전 주소로 돌아가면 검색창을 비우고, 앞으로 가면 검색어를 되살린다', async () => {
    server.use(
      http.get('*/api/v1/lectures', () =>
        rs({
          content: [summary(1, '썸네일 잘 만들기', 12000)],
          page: { size: 12, number: 0, totalElements: 1, totalPages: 1 },
        }),
      ),
    )
    const router = renderApp('/lectures', 'GUEST')
    await screen.findByRole('button', { name: /썸네일 잘 만들기/ })
    const box = screen.getByRole('searchbox', { name: '강의 검색' })
    await userEvent.type(box, 'AI{Enter}')
    await waitFor(() =>
      expect(router.state.location.search).toBe('?keyword=AI'),
    )

    await act(() => router.navigate(-1))
    expect(router.state.location.search).toBe('')
    expect(screen.getByRole('searchbox', { name: '강의 검색' })).toHaveValue('')

    await act(() => router.navigate(1))
    expect(screen.getByRole('searchbox', { name: '강의 검색' })).toHaveValue(
      'AI',
    )
  })

  it('검색어가 그대로인 동안에는 입력 중인 값을 덮어쓰지 않는다(정렬 변경)', async () => {
    server.use(
      http.get('*/api/v1/lectures', () =>
        rs({
          content: [summary(1, '썸네일 잘 만들기', 12000)],
          page: { size: 12, number: 0, totalElements: 1, totalPages: 1 },
        }),
      ),
    )
    const router = renderApp('/lectures', 'GUEST')
    await screen.findByRole('button', { name: /썸네일 잘 만들기/ })
    const box = screen.getByRole('searchbox', { name: '강의 검색' })
    await userEvent.type(box, '마이')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '정렬' }),
      'PRICE_ASC',
    )
    await waitFor(() =>
      expect(router.state.location.search).toBe('?sort=PRICE_ASC'),
    )
    expect(box).toHaveValue('마이')
  })

  it('비회원이 강의를 누르면 로그인 모달을 연다', async () => {
    server.use(
      http.get('*/api/v1/lectures', () =>
        rs({
          content: [summary(1, '썸네일 잘 만들기', 12000)],
          page: { size: 12, number: 0, totalElements: 1, totalPages: 1 },
        }),
      ),
    )
    renderApp('/lectures', 'GUEST')
    await userEvent.click(
      await screen.findByRole('button', { name: /썸네일 잘 만들기/ }),
    )
    expect(
      await screen.findByRole('dialog', { name: '합방 시작하기' }),
    ).toBeInTheDocument()
  })

  /** 강의 목록 요청의 page를 모은다. Spring Page처럼 범위를 넘는 페이지에는 빈 content와 실제 totalPages를 준다. */
  function serveLecturePages(totalPages: number) {
    const pages: number[] = []
    server.use(
      http.get('*/api/v1/lectures', ({ request }) => {
        const p = Number(new URL(request.url).searchParams.get('page'))
        pages.push(p)
        return rs({
          content:
            p < totalPages
              ? [summary(p + 1, `마이크 세팅 ${p + 1}`, 9000)]
              : [],
          page: {
            size: 12,
            number: p,
            totalElements: totalPages,
            totalPages,
          },
        })
      }),
      http.get('*/api/v1/lectures/purchased', () => rs(emptyPage)),
      http.get('*/api/v1/lectures/cart', () =>
        rs({ items: [], purchasableTotalHp: 0 }),
      ),
    )
    return pages
  }

  it('URL의 페이지가 마지막 페이지를 넘으면 검색어·정렬을 두고 마지막 페이지로 옮긴다', async () => {
    const pages = serveLecturePages(2)
    const router = renderApp(
      '/lectures?keyword=%EB%A7%88%EC%9D%B4%ED%81%AC&sort=PRICE_ASC&page=9',
      'USER',
    )

    expect(
      await screen.findByRole('link', { name: /마이크 세팅 2/ }),
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe(
      '?keyword=%EB%A7%88%EC%9D%B4%ED%81%AC&sort=PRICE_ASC&page=2',
    )
    expect(pages).toEqual([8, 1])
    expect(screen.queryByText('찾는 강의가 없어요')).not.toBeInTheDocument()
  })

  it('정수가 아닌 페이지는 첫 페이지로 부른다', async () => {
    const pages = serveLecturePages(2)
    renderApp('/lectures?page=1.5', 'USER')

    expect(
      await screen.findByRole('link', { name: /마이크 세팅 1/ }),
    ).toBeInTheDocument()
    expect(pages).toEqual([0])
  })
})

describe('바로 구매', () => {
  it('주문 확인에서 결제하면 주문 완료 화면으로 간다', async () => {
    mockLectureDetail()
    let ordered: number[] | undefined
    server.use(
      http.post('*/api/v1/lectures/orders', async ({ request }) => {
        ordered = ((await request.json()) as { lectureIds: number[] })
          .lectureIds
        // 주문한 뒤부터 구매 목록·주문 상세에 나온다.
        mockOrders(purchasedOrder())
        return rs(purchasedOrder(), 201)
      }),
    )
    renderApp('/lectures/7', 'USER', {
      revenueBalanceHp: 10000,
      availableTotalHp: 130000,
    })

    await userEvent.click(
      await screen.findByRole('button', { name: '바로 구매' }),
    )
    const dialog = await screen.findByRole('dialog', { name: '주문 확인' })
    // 수익 HP를 먼저 쓰는 미리보기
    expect(within(dialog).getByText('10,000')).toBeInTheDocument()
    expect(within(dialog).getByText('20,000')).toBeInTheDocument()

    await userEvent.click(
      within(dialog).getByRole('button', { name: '30,000 HP 결제' }),
    )
    expect(
      await screen.findByRole('heading', { name: '주문을 마쳤어요' }),
    ).toBeInTheDocument()
    expect(ordered).toEqual([7])
  })

  it('지갑을 불러오는 동안에는 결제할 수 없다', async () => {
    mockLectureDetail()
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    renderApp('/lectures/7', 'USER', async () => {
      await gate
      return rs({
        walletId: 1,
        chargeBalanceHp: 120000,
        revenueBalanceHp: 0,
        heldChargeHp: 0,
        heldRevenueHp: 0,
        availableTotalHp: 120000,
        heldTotalHp: 0,
      })
    })

    await userEvent.click(
      await screen.findByRole('button', { name: '바로 구매' }),
    )
    const dialog = await screen.findByRole('dialog', { name: '주문 확인' })
    expect(
      within(dialog).getByRole('button', { name: '잔액 확인 중…' }),
    ).toBeDisabled()

    release()
    expect(
      await within(dialog).findByRole('button', { name: '30,000 HP 결제' }),
    ).toBeEnabled()
  })

  it('지갑 조회에 실패하면 결제를 막고 다시 시도할 수 있다', async () => {
    mockLectureDetail()
    let fail = true
    renderApp('/lectures/7', 'USER', () =>
      fail
        ? HttpResponse.json(
            { status: 400, code: 'WALLET_UNAVAILABLE', detail: '지갑 오류' },
            { status: 400 },
          )
        : rs({
            walletId: 1,
            chargeBalanceHp: 120000,
            revenueBalanceHp: 0,
            heldChargeHp: 0,
            heldRevenueHp: 0,
            availableTotalHp: 120000,
            heldTotalHp: 0,
          }),
    )

    await userEvent.click(
      await screen.findByRole('button', { name: '바로 구매' }),
    )
    const dialog = await screen.findByRole('dialog', { name: '주문 확인' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '보유 HP를 불러오지 못했어요. 지갑 오류',
    )
    expect(
      within(dialog).getByRole('button', { name: '잔액을 확인하지 못했어요' }),
    ).toBeDisabled()

    fail = false
    await userEvent.click(
      within(dialog).getByRole('button', { name: '다시 시도' }),
    )
    expect(
      await within(dialog).findByRole('button', { name: '30,000 HP 결제' }),
    ).toBeEnabled()
  })

  it('HP가 모자라면 결제 대신 충전으로 안내한다', async () => {
    mockLectureDetail()
    renderApp('/lectures/7', 'USER', {
      revenueBalanceHp: 0,
      availableTotalHp: 5000,
    })

    await userEvent.click(
      await screen.findByRole('button', { name: '바로 구매' }),
    )
    const dialog = await screen.findByRole('dialog', { name: '주문 확인' })
    expect(await within(dialog).findByText('25,000 HP')).toBeInTheDocument()
    expect(
      within(dialog).getByRole('link', { name: 'HP 충전하러 가기' }),
    ).toHaveAttribute('href', '/wallet?charge=25000')
    expect(
      within(dialog).queryByRole('button', { name: /결제/ }),
    ).not.toBeInTheDocument()
  })

  it('관리자는 살 수 없다는 안내만 본다', async () => {
    mockLectureDetail()
    renderApp('/lectures/7', 'ADMIN')
    expect(
      await screen.findByText('관리자 계정은 강의를 구매할 수 없어요.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '바로 구매' }),
    ).not.toBeInTheDocument()
  })

  it.each([
    [409, 'WALLET_CLOSED', '탈퇴한 회원의 지갑이에요.'],
    [
      429,
      'TOO_MANY_REQUESTS',
      '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    ],
  ])(
    '주문이 %i %s로 거절되면 BE 안내를 보이고 주문 확인 창에 머문다',
    async (status, code, detail) => {
      mockLectureDetail()
      server.use(
        http.post('*/api/v1/lectures/orders', () =>
          HttpResponse.json(
            { status, code, detail },
            {
              status,
              headers: {
                'Content-Type': 'application/problem+json',
                ...(status === 429 && { 'Retry-After': '30' }),
              },
            },
          ),
        ),
      )
      renderApp('/lectures/7', 'USER', { availableTotalHp: 130000 })

      await userEvent.click(
        await screen.findByRole('button', { name: '바로 구매' }),
      )
      const dialog = await screen.findByRole('dialog', { name: '주문 확인' })
      await userEvent.click(
        within(dialog).getByRole('button', { name: '30,000 HP 결제' }),
      )

      expect(await screen.findByText(detail)).toBeInTheDocument()
      expect(dialog).toBeInTheDocument()
      // 실패해도 지갑을 다시 불러오므로, 잔액을 확인한 뒤 다시 결제할 수 있다.
      expect(
        await within(dialog).findByRole('button', { name: '30,000 HP 결제' }),
      ).toBeEnabled()
    },
  )
})

describe('주문 완료', () => {
  afterEach(() => vi.useRealTimers())

  it('202로 끝난 주문은 결제 처리 중을 보이고, 결제가 끝나면 완료 화면으로 바뀐다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const orders = await buyNow(holdOrder('HOLD_PENDING'), 202)

    expect(
      await screen.findByRole('heading', { name: '결제를 처리하고 있어요' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/다시 주문하지 마세요/)).toBeInTheDocument()
    expect(screen.getByText('주문 금액')).toBeInTheDocument()

    orders().set(purchasedOrder())
    await advance(5_000)
    expect(
      await screen.findByRole('heading', { name: '주문을 마쳤어요' }),
    ).toBeInTheDocument()
    expect(screen.getByText('결제한 HP')).toBeInTheDocument()
  })

  it('결제 취소 처리 중이던 주문이 결제 실패로 끝나면 실패 안내와 다시 살 길을 보인다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const orders = await buyNow(holdOrder('HOLD_COMPENSATING', 'DELAYED'), 202)

    expect(
      await screen.findByRole('heading', { name: '결제를 취소하고 있어요' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        '처리가 늦어지고 있어요. 자동으로 다시 시도하고 있어요.',
      ),
    ).toBeInTheDocument()

    orders().set(holdOrder('HOLD_FAILED'))
    await advance(5_000)
    expect(
      await screen.findByRole('heading', { name: '결제하지 못했어요' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/묶인 HP는 없어요/)).toBeInTheDocument()
    // 바로 구매한 강의는 장바구니에 없으므로 강의로 돌려보낸다.
    expect(
      screen.getByRole('link', { name: '강의로 돌아가기' }),
    ).toHaveAttribute('href', '/lectures/7')
    expect(screen.getByRole('link', { name: '주문 내역' })).toHaveAttribute(
      'href',
      '/library/orders',
    )
  })

  it('결제 처리 중에 다시 불러오기가 실패해도 처리 중 안내를 그대로 둔다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await buyNow(holdOrder('HOLD_PENDING'), 202)
    expect(
      await screen.findByRole('heading', { name: '결제를 처리하고 있어요' }),
    ).toBeInTheDocument()

    server.use(
      http.get('*/api/v1/lectures/orders/500', () =>
        HttpResponse.json({ status: 503 }, { status: 503 }),
      ),
    )
    // 다시 부른 요청이 재시도까지 모두 실패할 때까지 흘려보낸다.
    await advance(5_000)
    await advance(5_000)
    await waitFor(() =>
      expect(queryClient.getQueryState(orderQuery(500).queryKey)?.status).toBe(
        'error',
      ),
    )
    expect(
      screen.getByRole('heading', { name: '결제를 처리하고 있어요' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/다시 주문하지 마세요/)).toBeInTheDocument()
  })
})

describe('내 강의', () => {
  it('구매 확정 전 강의를 구매 취소하면 목록에서 빠진다', async () => {
    const orders = mockOrders(purchasedOrder())
    renderApp('/library', 'USER')

    await userEvent.click(
      await screen.findByRole('button', { name: '구매 취소' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: '구매를 취소할까요?',
    })
    await userEvent.click(
      within(dialog).getByRole('button', { name: '구매 취소' }),
    )

    expect(await screen.findByText('아직 산 강의가 없어요')).toBeInTheDocument()
    expect(orders.item(501)?.status).toBe('CANCELED')
  })

  it('구매 확정 전에는 재생 동의를 받은 뒤에 시청 URL을 받는다', async () => {
    const orders = mockOrders(purchasedOrder())
    mockLectureDetail()
    let accessCalls = 0
    server.use(
      http.get('*/api/v1/lectures/7/contents/71/access', () => {
        accessCalls++
        return rs({
          url: 'https://example.test/v.mp4',
          expiresAt: '2999-01-01T00:00:00',
        })
      }),
    )
    renderApp('/library/7/watch', 'USER')

    await userEvent.click(
      await screen.findByRole('button', { name: '동의하고 재생' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: '재생하면 구매가 확정돼요',
    })
    expect(accessCalls).toBe(0)
    const agree = within(dialog).getByRole('button', { name: '동의하고 재생' })
    expect(agree).toBeDisabled()
    await userEvent.click(within(dialog).getByRole('checkbox'))
    await userEvent.click(agree)

    await waitFor(() => expect(accessCalls).toBe(1))
    expect(orders.item(501)?.confirmationType).toBe('FIRST_PLAY')
    expect(document.querySelector('video')).toHaveAttribute(
      'src',
      'https://example.test/v.mp4',
    )
  })

  it('지급 처리 중 강의도 구매 확정으로 보이고 재생·리뷰할 수 있다', async () => {
    // 지급은 지급 예정 시각이 지나야 시작한다.
    const paying = purchasedOrder('PAYOUT_PENDING')
    paying.items[0] = {
      ...paying.items[0],
      purchasedAt: '2025-12-14T10:00:00',
      autoConfirmAt: '2025-12-22T00:00:00',
      payoutScheduledAt: '2026-01-14T00:00:00',
      processingStatus: 'DELAYED',
    }
    mockOrders(paying)
    renderApp('/library', 'USER')

    expect(await screen.findByText('구매 확정')).toHaveClass('pill', 'ok')
    expect(screen.getByRole('button', { name: '재생' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '리뷰' })).toHaveAttribute(
      'href',
      '/library/7/review',
    )
    expect(
      await screen.findByText('이의 제기 기간이 끝났어요'),
    ).toBeInTheDocument()
    for (const name of ['구매 확정', '구매 취소'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    // 판매자 지급이 늦어지는 것은 구매자에게 안내하지 않는다.
    expect(screen.queryByText(/처리가 늦어지고 있어요/)).not.toBeInTheDocument()
  })

  it('보유하지 않은 강의의 시청 화면은 안내만 보여 준다', async () => {
    mockLectureDetail()
    server.use(
      http.get('*/api/v1/lectures/purchased', () =>
        HttpResponse.json({ statusCode: 200, message: '', data: emptyPage }),
      ),
    )
    renderApp('/library/7/watch', 'USER')
    expect(
      await screen.findByText('볼 수 있는 강의가 아니에요'),
    ).toBeInTheDocument()
  })
})

describe('주문 내역', () => {
  it('URL의 페이지가 마지막 페이지를 넘으면 마지막 페이지로 옮긴다', async () => {
    mockOrders(purchasedOrder())
    server.use(
      http.get('*/api/v1/lectures/orders', ({ request }) => {
        const p = Number(new URL(request.url).searchParams.get('page'))
        return rs({
          content:
            p < 2
              ? [
                  {
                    orderId: 500,
                    totalAmountHp: 30000,
                    status: 'PAID',
                    progress: 'IN_PROGRESS',
                    representativeTitle: '첫 방송 세팅',
                    itemCount: 1,
                    orderedAt: '2026-10-14T10:00:00',
                  },
                ]
              : [],
          page: { size: 10, number: p, totalElements: 11, totalPages: 2 },
        })
      }),
    )
    const router = renderApp('/library/orders?page=9', 'USER')

    expect(await screen.findByText('주문 번호 500')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?page=2')
    expect(screen.queryByText('주문 내역이 없어요')).not.toBeInTheDocument()
  })

  afterEach(() => vi.useRealTimers())

  const card = (orderId: number) =>
    screen.findByRole('region', { name: `주문 번호 ${orderId}` })

  it('결제 처리 중·결제 실패·구매 취소 처리 중 항목에 이름을 붙이고 지연·멈춤 안내를 보인다', async () => {
    const canceling = numbered(purchasedOrder(), 700, '취소 중 강의')
    canceling.items[0] = {
      ...canceling.items[0],
      status: 'CANCEL_PENDING',
      processingStatus: 'ACTION_REQUIRED',
    }
    mockOrders(
      numbered(holdOrder('HOLD_PENDING', 'DELAYED'), 500, '결제 중 강의'),
      numbered(holdOrder('HOLD_FAILED'), 600, '실패한 강의'),
      canceling,
    )
    renderApp('/library/orders', 'USER')

    const paying = await card(500)
    expect(await within(paying).findByText('결제 처리 중')).toHaveClass(
      'pill',
      'warn',
    )
    expect(
      within(paying).getByText(
        '처리가 늦어지고 있어요. 자동으로 다시 시도하고 있어요.',
      ),
    ).toBeInTheDocument()

    const failed = await card(600)
    expect(await within(failed).findByText('결제 실패')).toHaveClass(
      'pill',
      'bad',
    )
    expect(
      within(failed).getByText('결제하지 못한 주문이에요 · 묶인 HP 없음'),
    ).toBeInTheDocument()

    const canceled = await card(700)
    expect(await within(canceled).findByText('구매 취소 처리 중')).toHaveClass(
      'pill',
      'warn',
    )
    expect(
      within(canceled).getByText(/자동 처리가 멈춰 관리자가 확인하고 있어요/),
    ).toBeInTheDocument()
    expect(
      within(canceled).getByRole('link', { name: '고객센터' }),
    ).toHaveAttribute('href', '/support')
    expect(
      within(canceled).queryByRole('button', { name: '구매 취소' }),
    ).not.toBeInTheDocument()
  })

  it('처리 중 주문은 다시 불러와 결과로 바꾸고, 자동 처리가 멈춘 주문은 다시 부르지 않는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const orders = mockOrders(
      numbered(holdOrder('HOLD_PENDING'), 500, '결제 중 강의'),
      numbered(holdOrder('HOLD_PENDING', 'ACTION_REQUIRED'), 600, '멈춘 강의'),
    )
    renderApp('/library/orders', 'USER')

    const paying = await card(500)
    expect(await within(paying).findByText('결제 처리 중')).toBeInTheDocument()
    const stuck = await card(600)
    expect(
      await within(stuck).findByText(/자동 처리가 멈춰/),
    ).toBeInTheDocument()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    const stuckCalls = orders.detailCalls(600)

    // 주문 목록은 다시 부르지 않으므로 머리의 결제 실패 안내는 다시 부른 주문 상세에서 온다.
    orders.set(numbered(holdOrder('HOLD_FAILED'), 500, '결제 중 강의'))
    await advance(5_000)
    expect(await within(paying).findByText('결제 실패')).toBeInTheDocument()
    expect(
      within(paying).getByText('결제하지 못한 주문이에요 · 묶인 HP 없음'),
    ).toBeInTheDocument()

    await advance(20_000)
    expect(orders.detailCalls(600)).toBe(stuckCalls)
  })

  it('처리 중 주문을 다시 불러오다 실패해도 이미 받은 항목을 그대로 보인다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockOrders(numbered(holdOrder('HOLD_PENDING'), 500, '결제 중 강의'))
    renderApp('/library/orders', 'USER')

    const paying = await card(500)
    expect(await within(paying).findByText('결제 처리 중')).toBeInTheDocument()

    server.use(
      http.get('*/api/v1/lectures/orders/500', () =>
        HttpResponse.json({ status: 503 }, { status: 503 }),
      ),
    )
    await advance(5_000)
    await advance(5_000)
    await waitFor(() =>
      expect(queryClient.getQueryState(orderQuery(500).queryKey)?.status).toBe(
        'error',
      ),
    )
    expect(within(paying).getByText('결제 처리 중')).toBeInTheDocument()
    expect(within(paying).getByText('결제 중 강의')).toBeInTheDocument()
  })

  it('구매 취소가 202로 끝나면 구매 취소 처리 중으로 보이고 취소 버튼을 숨긴다', async () => {
    const orders = mockOrders(purchasedOrder())
    orders.cancelLater()
    renderApp('/library/orders', 'USER')

    const order = await card(500)
    await userEvent.click(
      await within(order).findByRole('button', { name: '구매 취소' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: '구매를 취소할까요?',
    })
    await userEvent.click(
      within(dialog).getByRole('button', { name: '구매 취소' }),
    )

    expect(
      await screen.findByText(
        '구매 취소를 처리하고 있어요. HP 반환이 끝나면 주문 내역에 반영돼요.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('구매를 취소했어요. 결제한 HP를 돌려받았어요.'),
    ).not.toBeInTheDocument()
    expect(
      await within(order).findByText('구매 취소 처리 중'),
    ).toBeInTheDocument()
    expect(
      within(order).queryByRole('button', { name: '구매 취소' }),
    ).not.toBeInTheDocument()
    expect(orders.item(501)?.status).toBe('CANCEL_PENDING')
  })
})

describe('구매자 흐름 회귀', () => {
  it('두 번째 페이지의 구매 강의도 시청할 수 있다', async () => {
    mockLectureDetail()
    const pages: number[] = []
    server.use(
      http.get('*/api/v1/lectures/purchased', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        pages.push(page)
        return rs({
          content:
            page === 0
              ? Array.from({ length: 100 }, (_, i) => ({
                  lectureId: 100 + i,
                  orderId: 600 + i,
                  orderItemId: 700 + i,
                  title: `구매 강의 ${i}`,
                  thumbnailUrl: null,
                  itemStatus: 'CONFIRMED',
                  lectureDeleted: false,
                  purchasedAt: '2026-10-14T10:00:00',
                }))
              : [
                  {
                    lectureId: 7,
                    orderId: 500,
                    orderItemId: 501,
                    title: detail.title,
                    thumbnailUrl: null,
                    itemStatus: 'CONFIRMED',
                    lectureDeleted: false,
                    purchasedAt: '2026-10-14T10:00:00',
                  },
                ],
          page: { number: page, size: 100, totalElements: 101, totalPages: 2 },
        })
      }),
      http.get('*/api/v1/lectures/7/contents/71/access', () =>
        rs({
          url: 'https://example.test/owned.mp4',
          expiresAt: '2999-01-01T00:00:00',
        }),
      ),
    )
    renderApp('/library/7/watch', 'USER')
    await waitFor(() =>
      expect(document.querySelector('video')).toHaveAttribute(
        'src',
        'https://example.test/owned.mp4',
      ),
    )
    expect(pages).toEqual([0, 1])
  })

  it('첫 페이지 밖의 내 리뷰를 찾아 내용 없이 별점만 수정한다', async () => {
    mockOrders(purchasedOrder('CONFIRMED'))
    let saved: unknown
    let creates = 0
    server.use(
      http.get('*/api/v1/lectures/7/reviews', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        return rs({
          content:
            page === 0
              ? Array.from({ length: 100 }, (_, i) => ({
                  reviewId: i + 1,
                  reviewerUserId: i + 10,
                  reviewerNickname: `구매자 ${i}`,
                  rating: 5,
                  content: null,
                  createdAt: '2026-10-14T10:00:00',
                  updatedAt: '2026-10-14T10:00:00',
                }))
              : [
                  {
                    reviewId: 1001,
                    reviewerUserId: 1,
                    reviewerNickname: '하늘',
                    rating: 3,
                    content: null,
                    createdAt: '2026-10-14T10:00:00',
                    updatedAt: '2026-10-14T10:00:00',
                  },
                ],
          page: { number: page, size: 100, totalElements: 101, totalPages: 2 },
        })
      }),
      http.patch('*/api/v1/lectures/reviews/1001', async ({ request }) => {
        saved = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
      http.post('*/api/v1/lectures/7/reviews', () => {
        creates++
        return rs({ id: 1002 })
      }),
    )
    const router = renderApp('/library/7/review', 'USER')
    const save = await screen.findByRole('button', { name: '리뷰 고치기' })
    expect(save).toBeEnabled()
    await userEvent.click(screen.getByRole('radio', { name: '4점' }))
    await userEvent.click(save)
    await waitFor(() => expect(saved).toEqual({ rating: 4, content: '' }))
    expect(creates).toBe(0)
    // 저장 뒤 내 강의로 이동해 다시 부르는 요청까지 끝나야 다음 테스트로 새지 않는다.
    // 이동은 비동기라 진행 중 조회 수만 보면 내 강의 화면의 조회가 시작되기 전일 수 있다.
    // 그 화면이 부르는 구매 목록(모든 페이지)과 주문 상세가 성공한 뒤 진행 중 조회 0을 확인한다.
    expect(await screen.findByText('리뷰를 고쳤어요.')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/library'))
    await waitFor(() => {
      expect(queryClient.getQueryState(purchasedQuery.queryKey)?.status).toBe(
        'success',
      )
      expect(queryClient.getQueryState(orderQuery(500).queryKey)?.status).toBe(
        'success',
      )
    })
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('자료 다운로드 시 만료된 주소 대신 새 주소를 발급받는다', async () => {
    mockOrders(purchasedOrder('CONFIRMED'))
    let calls = 0
    server.use(
      http.get('*/api/v1/lectures/7', () =>
        rs({ ...detail, contents: [detail.contents[1]] }),
      ),
      http.get('*/api/v1/lectures/7/contents/72/access', () => {
        calls++
        return rs({
          url: `https://example.test/document-${calls}.pdf`,
          expiresAt:
            calls === 1 ? '2000-01-01T00:00:00' : '2999-01-01T00:00:00',
        })
      }),
    )
    let downloaded: string | undefined
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloaded = this.href
      })
    try {
      renderApp('/library/7/watch', 'USER')
      await userEvent.click(
        await screen.findByRole('button', { name: '자료 내려받기' }),
      )
      await waitFor(() =>
        expect(downloaded).toBe('https://example.test/document-2.pdf'),
      )
      expect(calls).toBe(2)
    } finally {
      click.mockRestore()
    }
  })
})
