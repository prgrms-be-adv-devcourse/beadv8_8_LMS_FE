import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { cartKeys } from '@/entities/cart/api'
import { createOrder, orderKeys } from '@/entities/order/api'
import { walletKeys } from '@/entities/wallet/api'
import { chargeHref } from '@/entities/wallet/charge'
import { CheckoutCoupons } from '@/features/checkout-coupon/CheckoutCoupons'
import type { CouponSelection } from '@/entities/coupon/types'
import { useCheckoutCoupons } from '@/features/checkout-coupon/useCheckoutCoupons'
import { useHpSpend } from '@/entities/wallet/useHpSpend'
import { HpSpendBreakdown } from '@/entities/wallet/ui/HpSpendBreakdown'
import { formatNumber } from '@/shared/lib/money'
import { Modal } from '@/shared/ui/Modal'
import { toast } from '@/shared/ui/toastStore'

export type CheckoutItem = { lectureId: number; title: string; priceHp: number }

type CheckoutModalProps = {
  items: CheckoutItem[]
  onClose: () => void
}

/** 주문 요청의 쿠폰 부분. 쿠폰이 없으면 null(기존 주문과 같다) */
type OrderCoupons = {
  coupons: CouponSelection[]
  expectedBuyerAmountHp: number
} | null

/**
 * 주문 확인 (장바구니 주문·바로 구매). 결제할 HP와 보유 HP는 미리보기이고, 실제 차감·보류는 서버가 한다.
 * HP 결제는 수익 HP를 먼저 다 쓰고 충전 HP를 쓴다(순서 변경 불가).
 * 쿠폰은 열 때 추천을 적용한다. 쿠폰을 적용했으면 결제액·주문 쿠폰은 미리보기 응답에서 가져온다.
 */
export function CheckoutModal({ items, onClose }: CheckoutModalProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const coupons = useCheckoutCoupons(items)

  const order = useMutation({
    mutationFn: (withCoupons: OrderCoupons) =>
      createOrder(
        items.map((i) => i.lectureId),
        withCoupons?.coupons,
        withCoupons?.expectedBuyerAmountHp,
      ),
    onSuccess: (created) => {
      navigate(`/library/orders/${created.orderId}/done`)
    },
    onError: (error) => toast(error.message),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: cartKeys.all }),
        queryClient.invalidateQueries({ queryKey: orderKeys.all }),
        queryClient.invalidateQueries({ queryKey: walletKeys.all }),
      ]),
  })

  const total = coupons.amount
  // 잔액과 HP 차감 구성을 보여 준 뒤에만 결제할 수 있다. 불러오는 중이거나 실패하면 결제를 막는다.
  const spend = useHpSpend(total)
  const applied = coupons.orderCoupons !== null

  return (
    <Modal
      title="주문 확인"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          {!spend.ready ? (
            <button type="button" className="btn primary" disabled>
              {spend.error ? '잔액을 확인하지 못했어요' : '잔액 확인 중…'}
            </button>
          ) : spend.short > 0 ? (
            <Link className="btn primary" to={chargeHref(spend.short)}>
              HP 충전하러 가기
            </Link>
          ) : (
            <button
              type="button"
              className="btn primary"
              // 쿠폰 할인을 계산하는 동안에는 금액이 정해지지 않아 막는다.
              disabled={
                order.isPending || coupons.pending || items.length === 0
              }
              onClick={() => order.mutate(coupons.orderCoupons)}
            >
              {order.isPending ? (
                <>
                  <span className="spinner sm" aria-hidden="true" />
                  결제하는 중…
                </>
              ) : coupons.pending ? (
                '할인 계산 중…'
              ) : coupons.failed ? (
                `쿠폰 없이 ${formatNumber(total)} HP 결제`
              ) : (
                `${formatNumber(total)} HP 결제`
              )}
            </button>
          )}
        </>
      }
    >
      {!applied && (
        <div className="rows">
          {items.map((item) => (
            <div
              key={item.lectureId}
              className="row-item"
              style={{ padding: '10px 0' }}
            >
              <div className="row-main">
                <span className="row-title">{item.title}</span>
              </div>
              <span className="num">{formatNumber(item.priceHp)} HP</span>
            </div>
          ))}
        </div>
      )}
      <CheckoutCoupons coupons={coupons} lines={items} />
      {applied && total === 0 && (
        <p className="fine" role="status">
          결제할 HP가 없어 바로 주문이 끝나요.
        </p>
      )}
      <HpSpendBreakdown
        spend={spend}
        label="결제할 HP"
        note="수익 HP를 먼저 쓰고 부족한 만큼 충전 HP를 써요. 결제한 HP는 구매일 다음 날부터 30일간 보류되고, 구매 취소하면 쓴 HP 종류 그대로 돌려받아요."
      />
    </Modal>
  )
}
