import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { LectureDetail, LectureSummary } from '@/entities/lecture/types'
import type { Order, OrderItemStatus } from '@/entities/order/types'
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
    orderedAt: '2026-10-14T10:00:00',
    canceledAt: null,
    items: [
      {
        orderItemId: 501,
        lectureId: 7,
        lectureTitle: '첫 방송 세팅',
        priceHp: 30000,
        status,
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
    document.cookie = 'XSRF-TOKEN=t'
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
})

describe('내 강의', () => {
  it('구매 확정 전 강의를 구매 취소하면 목록에서 빠진다', async () => {
    const orders = mockOrders(purchasedOrder())
    document.cookie = 'XSRF-TOKEN=t'
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
    document.cookie = 'XSRF-TOKEN=t'
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
    document.cookie = 'XSRF-TOKEN=t'
    renderApp('/library/7/review', 'USER')
    const save = await screen.findByRole('button', { name: '리뷰 고치기' })
    expect(save).toBeEnabled()
    await userEvent.click(screen.getByRole('radio', { name: '4점' }))
    await userEvent.click(save)
    await waitFor(() => expect(saved).toEqual({ rating: 4, content: '' }))
    expect(creates).toBe(0)
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
