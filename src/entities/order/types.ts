/**
 * 주문 상태. 주문은 HP 보류보다 먼저 저장되고, 모든 항목의 보류가 성공해야 PAID가 된다(BE D58).
 * - HOLD_PENDING: 결제 처리 중. HP 보류 결과를 기다린다
 * - HOLD_COMPENSATING: 결제 취소 처리 중. 보류가 거절돼 이미 성공한 보류를 돌려주는 중이다
 * - HOLD_FAILED: 결제 실패. 묶여 남은 HP가 없다. 주문 내역에 남는다
 * - PAID: 결제 완료
 * - CANCELED: 모든 항목이 구매 취소 또는 반환되었다
 */
export type OrderStatus =
  'HOLD_PENDING' | 'HOLD_COMPENSATING' | 'HOLD_FAILED' | 'PAID' | 'CANCELED'

/** PAID 주문의 진행 상황 (항목 상태에서 파생) */
export type OrderProgress = 'IN_PROGRESS' | 'COMPLETED'

/**
 * 주문 항목 상태. 구매 확정·구매 취소·지급은 항목 단위다.
 * - HOLD_PENDING·HOLD_COMPENSATING·HOLD_FAILED: 주문의 결제 단계와 같은 값이다. 볼 수 없다
 * - PURCHASED: 구매. autoConfirmAt 전까지 구매 취소할 수 있고, 보기 전에 재생 동의가 필요하다
 * - CONFIRMED: 구매 확정. 구매 취소할 수 없다
 * - CANCEL_PENDING: 구매 취소 처리 중. HP를 돌려주는 중이고 더 볼 수 없다
 * - CANCELED: 구매 취소. HP가 반환되었고 더 볼 수 없다
 * - RETURN_PENDING: 반환 처리 중. 이의 제기가 인정되어 HP를 돌려주는 중이고 더 볼 수 없다
 * - RETURNED: 이의 제기 인정. HP가 반환되었고 더 볼 수 없다
 * - PAYOUT_PENDING: 판매자에게 지급하는 중. 구매 확정 뒤라 계속 볼 수 있다
 * - PAID_OUT: 판매자에게 지급 완료. 계속 볼 수 있다
 */
export type OrderItemStatus =
  | 'HOLD_PENDING'
  | 'HOLD_COMPENSATING'
  | 'HOLD_FAILED'
  | 'PURCHASED'
  | 'CONFIRMED'
  | 'CANCEL_PENDING'
  | 'CANCELED'
  | 'RETURN_PENDING'
  | 'RETURNED'
  | 'PAYOUT_PENDING'
  | 'PAID_OUT'

/**
 * 처리 중인 주문·항목의 처리 상태. 처리 중이 아니면 null이다.
 * - PROCESSING: 정상 처리 중
 * - DELAYED: 실패한 뒤 다시 시도하는 중
 * - ACTION_REQUIRED: 자동 처리가 멈춰 관리자 복구가 필요하다
 */
export type ProcessingStatus = 'PROCESSING' | 'DELAYED' | 'ACTION_REQUIRED'

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
  /** 결제 단계는 주문의 처리 상태와 같고, 구매 취소·반환·지급 처리 중은 그 항목의 처리 상태다 */
  processingStatus: ProcessingStatus | null
  /** 결제가 끝난 시각. 결제 단계에는 없다 */
  purchasedAt: string | null
  confirmedAt: string | null
  confirmationType: ConfirmationType | null
  /** 이 시각 전까지 구매 취소 가능 (구매일 + 8일 00:00 KST). 결제 단계에는 없다 */
  autoConfirmAt: string | null
  /** 이 시각 전까지 내용 다름 이의 제기 가능, 이후 판매자 지급 (구매일 + 31일 00:00 KST). 결제 단계에는 없다 */
  payoutScheduledAt: string | null
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
  /** 결제 단계(결제 처리 중·결제 취소 처리 중)일 때만 있다 */
  processingStatus: ProcessingStatus | null
  /** 주문을 시도한 시각 */
  orderedAt: string
  /** 모든 보류가 성공해 결제가 끝난 시각 */
  paidAt: string | null
  canceledAt: string | null
  items: OrderItem[]
}

/** GET /lectures/orders 한 줄 */
export type OrderSummary = {
  orderId: number
  totalAmountHp: number
  status: OrderStatus
  progress: OrderProgress | null
  /** 결제 단계(결제 처리 중·결제 취소 처리 중)일 때만 있다 */
  processingStatus: ProcessingStatus | null
  /** 첫 항목 제목 */
  representativeTitle: string
  itemCount: number
  orderedAt: string
}

/** GET /lectures/purchased 한 줄 (볼 수 있는 항목: PURCHASED·CONFIRMED·PAYOUT_PENDING·PAID_OUT) */
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
