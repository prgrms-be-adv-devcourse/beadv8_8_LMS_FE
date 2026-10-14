import { bypass, http, HttpResponse, type AnyHandler } from 'msw'
import type { Cart } from '@/entities/cart/types'
import type { LectureDetail, Review } from '@/entities/lecture/types'
import type {
  Order,
  OrderItem,
  OrderSummary,
  PurchasedLecture,
} from '@/entities/order/types'
import type { PagedModel, RsData } from '@/shared/api/types'

/**
 * 강의 모듈에서 BE가 아직 501을 주는 API(주문·구매한 강의·리뷰)의 목. 데이터는 메모리에만 둔다.
 * 강의 정보와 최초 장바구니는 실제 BE에서 읽되, 장바구니 변경도 메모리에만 둔다.
 * TODO: BE 강의 주문(13장 3·5단계)·리뷰(6단계)가 배포되면 이 파일을 지운다.
 */

type MockReview = Review & { lectureId: number }
type Db = { orders: Order[]; reviews: MockReview[]; seq: number; cart?: Cart }

export const lectureDb: Db = { orders: [], reviews: [], seq: 1 }

export function resetLectureDb() {
  lectureDb.orders = []
  lectureDb.reviews = []
  lectureDb.seq = 1
  lectureDb.cart = undefined
}

const ok = <T>(data: T, status = 200) =>
  HttpResponse.json<RsData<T>>(
    { statusCode: status, message: 'mock', data },
    { status },
  )

const problem = (status: number, code: string, detail: string) =>
  HttpResponse.json({ status, code, detail }, { status })

function page<T>(items: T[], url: URL): PagedModel<T> {
  const number = Number(url.searchParams.get('page') ?? 0)
  const size = Number(url.searchParams.get('size') ?? 20)
  return {
    content: items.slice(number * size, number * size + size),
    page: {
      number,
      size,
      totalElements: items.length,
      totalPages: Math.ceil(items.length / size),
    },
  }
}

/** KST LocalDateTime 문자열 (BE와 같은 형식) */
function kst(date: Date): string {
  return new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 19)
}

/** 구매일 + days일 00:00 KST */
function kstMidnightAfter(date: Date, days: number): string {
  const day = kst(date).slice(0, 10)
  const d = new Date(`${day}T00:00:00+09:00`)
  d.setUTCDate(d.getUTCDate() + days)
  return kst(d)
}

async function fetchLecture(
  origin: string,
  lectureId: number,
): Promise<LectureDetail | null> {
  const res = await fetch(
    bypass(new Request(`${origin}/api/v1/lectures/${lectureId}`)),
  )
  if (!res.ok) return null
  return ((await res.json()) as RsData<LectureDetail>).data
}

async function fetchMe(
  origin: string,
): Promise<{ id: number; nickname: string } | null> {
  const res = await fetch(bypass(new Request(`${origin}/api/v1/members/me`)))
  return res.ok ? res.json() : null
}

function findItem(orderId: number, orderItemId: number) {
  const order = lectureDb.orders.find((o) => o.orderId === orderId)
  const item = order?.items.find((i) => i.orderItemId === orderItemId)
  return order && item ? { order, item } : null
}

function refreshOrderStatus(order: Order) {
  const ended = (i: OrderItem) =>
    i.status === 'CANCELED' || i.status === 'RETURNED'
  if (order.items.every(ended)) {
    order.status = 'CANCELED'
    order.progress = null
    order.canceledAt = kst(new Date())
  }
}

const VIEWABLE = new Set(['PURCHASED', 'CONFIRMED', 'PAID_OUT'])

/** 실제 장바구니는 최초 조회만 하고 이후 변경은 개발용 메모리에 격리한다. */
async function mockCart(origin: string): Promise<Cart | null> {
  if (lectureDb.cart) return lectureDb.cart
  const res = await fetch(bypass(new Request(`${origin}/api/v1/lectures/cart`)))
  if (!res.ok) return null
  lectureDb.cart = ((await res.json()) as RsData<Cart>).data
  const orderedIds = new Set(
    lectureDb.orders.flatMap((o) => o.items.map((i) => i.lectureId)),
  )
  lectureDb.cart.items = lectureDb.cart.items.filter(
    (i) => !orderedIds.has(i.lectureId),
  )
  refreshCartTotal(lectureDb.cart)
  return lectureDb.cart
}

function refreshCartTotal(cart: Cart) {
  cart.purchasableTotalHp = cart.items
    .filter((i) => i.purchasable)
    .reduce((sum, i) => sum + i.priceHp, 0)
}

export const lectureHandlers: AnyHandler[] = [
  http.get('*/api/v1/lectures/cart', async ({ request }) => {
    const cart = await mockCart(new URL(request.url).origin)
    return cart
      ? ok(cart)
      : problem(503, 'CART_UNAVAILABLE', '장바구니를 불러오지 못했어요.')
  }),
  http.post('*/api/v1/lectures/cart/items', async ({ request }) => {
    const origin = new URL(request.url).origin
    const { lectureId } = (await request.json()) as { lectureId: number }
    const cart = await mockCart(origin)
    const lecture = await fetchLecture(origin, lectureId)
    if (!cart || !lecture || lecture.deleted || lecture.status !== 'ON_SALE')
      return problem(409, 'LECTURE_NOT_PURCHASABLE', '살 수 없는 강의예요.')
    if (cart.items.some((i) => i.lectureId === lectureId))
      return problem(409, 'ALREADY_IN_CART', '이미 담은 강의예요.')
    cart.items.push({
      lectureId,
      title: lecture.title,
      priceHp: lecture.priceHp,
      thumbnailUrl: lecture.thumbnailUrl,
      purchasable: true,
    })
    refreshCartTotal(cart)
    return new HttpResponse(null, { status: 204 })
  }),
  http.delete(
    '*/api/v1/lectures/cart/items/:lectureId',
    async ({ request, params }) => {
      const cart = await mockCart(new URL(request.url).origin)
      if (!cart)
        return problem(503, 'CART_UNAVAILABLE', '장바구니를 불러오지 못했어요.')
      cart.items = cart.items.filter(
        (i) => i.lectureId !== Number(params.lectureId),
      )
      refreshCartTotal(cart)
      return new HttpResponse(null, { status: 204 })
    },
  ),
  http.post('*/api/v1/lectures/orders', async ({ request }) => {
    const { lectureIds } = (await request.json()) as { lectureIds: number[] }
    const origin = new URL(request.url).origin
    const lectures = await Promise.all(
      lectureIds.map((id) => fetchLecture(origin, id)),
    )
    if (lectures.some((l) => !l || l.status !== 'ON_SALE' || l.deleted))
      return problem(
        409,
        'LECTURE_NOT_PURCHASABLE',
        '살 수 없는 강의가 있어요.',
      )

    const now = new Date()
    const order: Order = {
      orderId: lectureDb.seq++,
      totalAmountHp: lectures.reduce((sum, l) => sum + l!.priceHp, 0),
      status: 'PAID',
      progress: 'IN_PROGRESS',
      orderedAt: kst(now),
      canceledAt: null,
      items: lectures.map((l) => ({
        orderItemId: lectureDb.seq++,
        lectureId: l!.lectureId,
        lectureTitle: l!.title,
        priceHp: l!.priceHp,
        status: 'PURCHASED',
        purchasedAt: kst(now),
        confirmedAt: null,
        confirmationType: null,
        autoConfirmAt: kstMidnightAfter(now, 8),
        payoutScheduledAt: kstMidnightAfter(now, 31),
        canceledAt: null,
        returnedAt: null,
        objectionStatus: 'NONE',
      })),
    }
    lectureDb.orders.unshift(order)

    // 모의 주문은 실제 장바구니를 변경하지 않는다.
    if (lectureDb.cart) {
      lectureDb.cart.items = lectureDb.cart.items.filter(
        (i) => !lectureIds.includes(i.lectureId),
      )
      refreshCartTotal(lectureDb.cart)
    }
    return ok(order, 201)
  }),

  http.get('*/api/v1/lectures/orders', ({ request }) => {
    const summaries: OrderSummary[] = lectureDb.orders.map((o) => ({
      orderId: o.orderId,
      totalAmountHp: o.totalAmountHp,
      status: o.status,
      progress: o.progress,
      representativeTitle: o.items[0]?.lectureTitle ?? '',
      itemCount: o.items.length,
      orderedAt: o.orderedAt,
    }))
    return ok(page(summaries, new URL(request.url)))
  }),

  http.get('*/api/v1/lectures/orders/:orderId', ({ params }) => {
    const order = lectureDb.orders.find(
      (o) => o.orderId === Number(params.orderId),
    )
    return order
      ? ok(order)
      : problem(404, 'ORDER_NOT_FOUND', '주문을 찾을 수 없어요.')
  }),

  http.post(
    '*/api/v1/lectures/orders/:orderId/items/:orderItemId/:action',
    ({ params }) => {
      const found = findItem(Number(params.orderId), Number(params.orderItemId))
      if (!found)
        return problem(404, 'ORDER_NOT_FOUND', '주문을 찾을 수 없어요.')
      const { order, item } = found
      if (item.status !== 'PURCHASED')
        return problem(
          409,
          'NOT_PURCHASED',
          '구매 확정 전 항목만 처리할 수 있어요.',
        )
      const now = kst(new Date())
      if (params.action === 'cancel') {
        if (now >= item.autoConfirmAt)
          return problem(
            409,
            'CANCEL_PERIOD_EXPIRED',
            '구매 취소 기한이 지났어요.',
          )
        item.status = 'CANCELED'
        item.canceledAt = now
        refreshOrderStatus(order)
      } else {
        item.status = 'CONFIRMED'
        item.confirmedAt = now
        item.confirmationType =
          params.action === 'confirm' ? 'DIRECT' : 'FIRST_PLAY'
      }
      return ok(item)
    },
  ),

  http.get('*/api/v1/lectures/purchased', ({ request }) => {
    const purchased: PurchasedLecture[] = lectureDb.orders.flatMap((o) =>
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
    return ok(page(purchased, new URL(request.url)))
  }),

  http.get('*/api/v1/lectures/:lectureId/reviews', ({ params, request }) => {
    const list = lectureDb.reviews.filter(
      (r) => r.lectureId === Number(params.lectureId),
    )
    return ok(page(list, new URL(request.url)))
  }),

  http.post(
    '*/api/v1/lectures/:lectureId/reviews',
    async ({ params, request }) => {
      const body = (await request.json()) as {
        orderItemId: number
        rating: number
        content: string
      }
      const now = kst(new Date())
      const me = await fetchMe(new URL(request.url).origin)
      const review: MockReview = {
        reviewId: lectureDb.seq++,
        lectureId: Number(params.lectureId),
        reviewerUserId: me?.id ?? 0,
        reviewerNickname: me?.nickname ?? '나',
        rating: body.rating,
        content: body.content,
        createdAt: now,
        updatedAt: now,
      }
      lectureDb.reviews.unshift(review)
      return ok({ id: review.reviewId }, 201)
    },
  ),

  http.patch(
    '*/api/v1/lectures/reviews/:reviewId',
    async ({ params, request }) => {
      const review = lectureDb.reviews.find(
        (r) => r.reviewId === Number(params.reviewId),
      )
      if (!review)
        return problem(404, 'REVIEW_NOT_FOUND', '리뷰를 찾을 수 없어요.')
      Object.assign(review, await request.json(), {
        updatedAt: kst(new Date()),
      })
      return new HttpResponse(null, { status: 204 })
    },
  ),

  http.delete('*/api/v1/lectures/reviews/:reviewId', ({ params }) => {
    lectureDb.reviews = lectureDb.reviews.filter(
      (r) => r.reviewId !== Number(params.reviewId),
    )
    return new HttpResponse(null, { status: 204 })
  }),
]
