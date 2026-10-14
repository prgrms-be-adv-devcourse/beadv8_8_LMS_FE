/** GET /lectures/cart 한 줄 */
export type CartItem = {
  lectureId: number
  title: string
  priceHp: number
  thumbnailUrl: string | null
  /** 담은 뒤 판매 중지·삭제되면 false. 주문할 수 없다 */
  purchasable: boolean
}

export type Cart = {
  items: CartItem[]
  /** 구매 가능한 항목의 가격 합 (서버 계산) */
  purchasableTotalHp: number
}
