/** GET /wallets/me (BE WalletResponse). 금액은 모두 서버 값을 그대로 표시한다. */
export type Wallet = {
  walletId: number
  /** 충전 HP (환불 가능) */
  chargeBalanceHp: number
  /** 수익 HP (환전 가능) */
  revenueBalanceHp: number
  heldChargeHp: number
  heldRevenueHp: number
  /** 충전 HP + 수익 HP */
  availableTotalHp: number
  /** 보류 HP 합계 */
  heldTotalHp: number
}
