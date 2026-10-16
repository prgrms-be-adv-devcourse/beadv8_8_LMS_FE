import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { cartKeys } from '@/entities/cart/api'
import { createOrder, orderKeys } from '@/entities/order/api'
import { walletKeys } from '@/entities/wallet/api'
import { chargeHref } from '@/entities/wallet/charge'
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

/**
 * 주문 확인 (장바구니 주문·바로 구매). 결제할 HP와 보유 HP는 미리보기이고, 실제 차감·보류는 서버가 한다.
 * HP 결제는 수익 HP를 먼저 다 쓰고 충전 HP를 쓴다(순서 변경 불가).
 */
export function CheckoutModal({ items, onClose }: CheckoutModalProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const order = useMutation({
    mutationFn: () => createOrder(items.map((i) => i.lectureId)),
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

  const total = items.reduce((sum, i) => sum + i.priceHp, 0)
  // 잔액과 HP 차감 구성을 보여 준 뒤에만 결제할 수 있다. 불러오는 중이거나 실패하면 결제를 막는다.
  const spend = useHpSpend(total)

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
              disabled={order.isPending || items.length === 0}
              onClick={() => order.mutate()}
            >
              {order.isPending ? (
                <>
                  <span className="spinner sm" aria-hidden="true" />
                  결제하는 중…
                </>
              ) : (
                `${formatNumber(total)} HP 결제`
              )}
            </button>
          )}
        </>
      }
    >
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
      <HpSpendBreakdown
        spend={spend}
        label="결제할 HP"
        note="수익 HP를 먼저 쓰고 부족한 만큼 충전 HP를 써요. 결제한 HP는 구매일 다음 날부터 30일간 보류되고, 구매 취소하면 쓴 HP 종류 그대로 돌려받아요."
      />
    </Modal>
  )
}
