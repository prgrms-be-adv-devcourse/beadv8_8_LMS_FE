/** 주문 상태. 주문은 HP 보류가 성공해야 생기므로 결제 대기·실패가 없다. */
export type OrderStatus = 'PAID' | 'CANCELED'

/** PAID 주문의 진행 상황 (항목 상태에서 파생) */
export type OrderProgress = 'IN_PROGRESS' | 'COMPLETED'

/**
 * 주문 항목 상태. 구매 확정·구매 취소·지급은 항목 단위다.
 * - PURCHASED: 구매. autoConfirmAt 전까지 구매 취소할 수 있고, 보기 전에 재생 동의가 필요하다
 * - CONFIRMED: 구매 확정. 구매 취소할 수 없다
 * - CANCELED: 구매 취소. HP가 반환되었고 더 볼 수 없다
 * - RETURNED: 이의 제기 인정. HP가 반환되었고 더 볼 수 없다
 * - PAID_OUT: 판매자에게 지급 완료. 계속 볼 수 있다
 */
export type OrderItemStatus =
  'PURCHASED' | 'CONFIRMED' | 'CANCELED' | 'RETURNED' | 'PAID_OUT'

export type ConfirmationType = 'DIRECT' | 'FIRST_PLAY' | 'AUTO'

export type ObjectionStatus = 'NONE' | 'FILED' | 'ACCEPTED' | 'REJECTED'

export type OrderItem = {
  orderItemId: number
  lectureId: number
  /** 주문 시점 제목 */
  lectureTitle: string
  /** 주문 시점 가격 */
  priceHp: number
  status: OrderItemStatus
  purchasedAt: string
  confirmedAt: string | null
  confirmationType: ConfirmationType | null
  /** 이 시각 전까지 구매 취소 가능 (구매일 + 8일 00:00 KST) */
  autoConfirmAt: string
  /** 이 시각 전까지 내용 다름 이의 제기 가능, 이후 판매자 지급 (구매일 + 31일 00:00 KST) */
  payoutScheduledAt: string
  canceledAt: string | null
  returnedAt: string | null
  objectionStatus: ObjectionStatus
}

/** GET /lectures/orders/{orderId}, POST /lectures/orders */
export type Order = {
  orderId: number
  totalAmountHp: number
  status: OrderStatus
  progress: OrderProgress | null
  orderedAt: string
  canceledAt: string | null
  items: OrderItem[]
}

/** GET /lectures/orders 한 줄 */
export type OrderSummary = {
  orderId: number
  totalAmountHp: number
  status: OrderStatus
  progress: OrderProgress | null
  /** 첫 항목 제목 */
  representativeTitle: string
  itemCount: number
  orderedAt: string
}

/** GET /lectures/purchased 한 줄 (항목이 PURCHASED·CONFIRMED·PAID_OUT) */
export type PurchasedLecture = {
  lectureId: number
  orderId: number
  orderItemId: number
  title: string
  thumbnailUrl: string | null
  itemStatus: OrderItemStatus
  /** 판매자가 삭제한 강의. 기존 구매자는 계속 볼 수 있다 */
  lectureDeleted: boolean
  purchasedAt: string
}
