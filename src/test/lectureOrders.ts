import { http, HttpResponse } from 'msw'
import type { Order, OrderItem, PurchasedLecture } from '@/entities/order/types'
import { rs } from './renderApp'
import { server } from './server'

const VIEWABLE = new Set(['PURCHASED', 'CONFIRMED', 'PAID_OUT'])

/**
 * 주문을 가진 구매자의 강의 주문 API(구매 목록, 주문 상세, 구매 확정·취소·재생 동의)를 이 테스트에서만 켠다.
 * 상태는 이 호출 안에만 두고, 테스트가 끝나면 server.resetHandlers()로 핸들러와 함께 사라진다.
 */
export function mockOrders(...seed: Order[]) {
  const orders = structuredClone(seed)
  const item = (orderItemId: number): OrderItem | undefined =>
    orders.flatMap((o) => o.items).find((i) => i.orderItemId === orderItemId)

  server.use(
    http.get('*/api/v1/lectures/purchased', () => {
      const content: PurchasedLecture[] = orders.flatMap((o) =>
        o.items
          .filter((i) => VIEWABLE.has(i.status))
          .map((i) => ({
            lectureId: i.lectureId,
            orderId: o.orderId,
            orderItemId: i.orderItemId,
            title: i.lectureTitle,
            thumbnailUrl: null,
            itemStatus: i.status,
            lectureDeleted: false,
            purchasedAt: i.purchasedAt,
          })),
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
    http.get('*/api/v1/lectures/orders/:orderId', ({ params }) => {
      const order = orders.find((o) => o.orderId === Number(params.orderId))
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

  // 변경 요청이 반영됐는지 지금 상태의 주문 항목으로 확인한다.
  return { item }
}
