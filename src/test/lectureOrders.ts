import { http, HttpResponse } from 'msw'
import type {
  Order,
  OrderItem,
  OrderSummary,
  PurchasedLecture,
} from '@/entities/order/types'
import { rs } from './renderApp'
import { server } from './server'

/** 볼 수 있는 항목 상태(BE OrderItemStatus.isViewable) */
const VIEWABLE = new Set([
  'PURCHASED',
  'CONFIRMED',
  'PAYOUT_PENDING',
  'PAID_OUT',
])

/**
 * 주문을 가진 구매자의 강의 주문 API(구매 목록, 주문 목록·상세, 구매 확정·취소·재생 동의)를 이 테스트에서만 켠다.
 * 상태는 이 호출 안에만 두고, 테스트가 끝나면 server.resetHandlers()로 핸들러와 함께 사라진다.
 */
export function mockOrders(...seed: Order[]) {
  const orders = structuredClone(seed)
  let cancelLater = false
  // 주문 목록에 할인 필드(discountHp·buyerAmountHp)가 없던 옛 응답을 흉내 낸다
  let legacySummary = false
  const detailCalls = new Map<number, number>()
  const item = (orderItemId: number): OrderItem | undefined =>
    orders.flatMap((o) => o.items).find((i) => i.orderItemId === orderItemId)

  server.use(
    http.get('*/api/v1/lectures/purchased', () => {
      const content: PurchasedLecture[] = orders.flatMap((o) =>
        o.items.flatMap((i) =>
          VIEWABLE.has(i.status) && i.purchasedAt
            ? [
                {
                  lectureId: i.lectureId,
                  orderId: o.orderId,
                  orderItemId: i.orderItemId,
                  title: i.lectureTitle,
                  thumbnailUrl: null,
                  itemStatus: i.status,
                  lectureDeleted: false,
                  purchasedAt: i.purchasedAt,
                },
              ]
            : [],
        ),
      )
      return rs({
        content,
        page: {
          size: 100,
          number: 0,
          totalElements: content.length,
          totalPages: 1,
        },
      })
    }),
    http.get('*/api/v1/lectures/orders', () => {
      const content: OrderSummary[] = orders.map((o) => ({
        orderId: o.orderId,
        totalAmountHp: o.totalAmountHp,
        ...(legacySummary
          ? {}
          : { discountHp: o.discountHp, buyerAmountHp: o.buyerAmountHp }),
        status: o.status,
        progress: o.progress,
        processingStatus: o.processingStatus,
        representativeTitle: o.items[0].lectureTitle,
        itemCount: o.items.length,
        orderedAt: o.orderedAt,
      }))
      return rs({
        content,
        page: {
          size: 10,
          number: 0,
          totalElements: content.length,
          totalPages: 1,
        },
      })
    }),
    http.get('*/api/v1/lectures/orders/:orderId', ({ params }) => {
      const orderId = Number(params.orderId)
      detailCalls.set(orderId, (detailCalls.get(orderId) ?? 0) + 1)
      const order = orders.find((o) => o.orderId === orderId)
      return order
        ? rs(order)
        : HttpResponse.json({ status: 404 }, { status: 404 })
    }),
    http.post(
      '*/api/v1/lectures/orders/:orderId/items/:orderItemId/:action',
      ({ params }) => {
        const target = item(Number(params.orderItemId))
        if (!target) return HttpResponse.json({ status: 404 }, { status: 404 })
        const now = new Date().toISOString().slice(0, 19)
        if (params.action === 'cancel' && cancelLater) {
          target.status = 'CANCEL_PENDING'
          target.processingStatus = 'PROCESSING'
          return rs(target, 202)
        }
        if (params.action === 'cancel') {
          target.status = 'CANCELED'
          target.canceledAt = now
        } else {
          target.status = 'CONFIRMED'
          target.confirmedAt = now
          target.confirmationType =
            params.action === 'confirm' ? 'DIRECT' : 'FIRST_PLAY'
        }
        return rs(target)
      },
    ),
  )

  return {
    /** 변경 요청이 반영됐는지 지금 상태의 주문 항목으로 확인한다. */
    item,
    /** 주문 하나를 새 상태로 바꾼다. 처리 중이던 주문이 끝난 결과를 다시 불러오게 할 때 쓴다 */
    set(order: Order) {
      const index = orders.findIndex((o) => o.orderId === order.orderId)
      orders[index] = structuredClone(order)
    },
    /** 주문 상세를 부른 횟수. 처리 중 주문을 다시 부르는지 확인한다 */
    detailCalls: (orderId: number) => detailCalls.get(orderId) ?? 0,
    /** 이후 구매 취소를 반환이 끝나지 않은 202 + CANCEL_PENDING으로 응답한다 */
    cancelLater() {
      cancelLater = true
    },
    /** 이후 주문 목록을 할인 필드 없는 옛 응답으로 준다 */
    legacySummary() {
      legacySummary = true
    },
  }
}

/** 주문 생성 요청 본문(OrderCreateRequest). 쿠폰이 없으면 coupons·expectedBuyerAmountHp가 없다 */
export type OrderCreateBody = {
  lectureIds: number[]
  coupons?: { memberCouponId: number; lectureId: number }[]
  expectedBuyerAmountHp?: number
}

/** 주문 생성 응답 차례 한 칸. 주문이면 201(PAID)·202(그 밖), Response면 그대로(409·503 등) */
export type OrderCreateReply = Order | Response

/**
 * 주문 생성(POST /lectures/orders)을 흉내 낸다. 본문을 순서대로 기록하고, 응답은 차례대로 쓴다(마지막 값은 계속 쓴다).
 * 주문으로 답하면 그 주문의 상세·목록(mockOrders)을 그때 켜서 완료 화면이 결과를 볼 수 있게 한다.
 * PAID는 201, 결제 처리 중·실패는 202다(BE와 같음).
 */
export function mockCreateOrder(...replies: OrderCreateReply[]) {
  const bodies: OrderCreateBody[] = []
  let orders: ReturnType<typeof mockOrders> | undefined
  server.use(
    http.post('*/api/v1/lectures/orders', async ({ request }) => {
      bodies.push((await request.json()) as OrderCreateBody)
      const reply = replies.length > 1 ? replies.shift()! : replies[0]
      if (reply instanceof Response) return reply
      orders = mockOrders(reply)
      return rs(reply, reply.status === 'PAID' ? 201 : 202)
    }),
  )
  return {
    /** 받은 주문 요청 본문(순서대로) */
    bodies,
    /** 마지막으로 만든 주문의 상세·목록 흉내. 주문을 만든 뒤에만 있다 */
    orders: () => orders,
  }
}
