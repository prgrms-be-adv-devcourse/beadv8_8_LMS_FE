import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { orderQuery } from '@/entities/order/api'
import { COUPON_RETRY } from '@/entities/order/discount'
import { orderPollInterval } from '@/entities/order/processing'
import type { Order, OrderItem } from '@/entities/order/types'
import { ProcessingNote } from '@/entities/order/ui/ProcessingNote'
import { formatDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { LoadError, Loading } from '@/shared/ui/QueryState'

/**
 * 주문 결과. 결제가 끝난(PAID) 주문만 완료로 안내한다.
 * 결제 처리 중이면 주문 상세를 다시 불러(orderQuery) 결과가 나오는 대로 화면을 바꾼다.
 */
export function OrderDonePage() {
  const orderId = Number(useParams().orderId)
  const { data: order, error, refetch } = useQuery(orderQuery(orderId))

  // 다시 불러오다 실패해도(일시 오류) 이미 받은 주문을 그대로 보이고, 다음 다시 불러오기를 기다린다.
  return (
    <div className="page narrow">
      {order ? (
        <OrderResult order={order} />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : (
        <Loading />
      )}
    </div>
  )
}

const ordersLink = (primary = false) => (
  <Link className={primary ? 'btn primary' : 'btn'} to="/library/orders">
    주문 내역
  </Link>
)

/** 결과를 기다리는 동안의 안내. 자동 처리가 멈추면 다시 부르지 않으므로 화면이 저절로 바뀌지 않는다 */
const followUp = (order: Order) =>
  orderPollInterval(order)
    ? '결과가 나오면 이 화면이 바뀌어요.'
    : '결과는 주문 내역에서 확인해 주세요.'

function OrderResult({ order }: { order: Order }) {
  switch (order.status) {
    case 'PAID': {
      const cancelUntil = order.items[0]?.autoConfirmAt
      return (
        <ResultPanel
          order={order}
          tone="ok"
          title="주문을 마쳤어요"
          text={`내 강의에서 바로 볼 수 있어요.${
            cancelUntil
              ? ` 재생하거나 자료를 받기 전이면 ${formatDate(cancelUntil)} 전까지 구매 취소할 수 있어요.`
              : ''
          }`}
          actions={
            <>
              <Link className="btn primary" to="/library">
                내 강의로
              </Link>
              {ordersLink()}
              <Link className="btn ghost" to="/lectures">
                강의 더 보기
              </Link>
            </>
          }
        />
      )
    }
    case 'HOLD_PENDING':
      return (
        <ResultPanel
          order={order}
          tone="wait"
          title="결제를 처리하고 있어요"
          text={`HP 결제 결과를 확인하고 있어요. ${followUp(order)} 다시 주문하지 마세요.`}
          note={<ProcessingNote status={order.processingStatus} />}
          actions={ordersLink()}
        />
      )
    case 'HOLD_COMPENSATING':
      return (
        <ResultPanel
          order={order}
          tone="wait"
          title="결제를 취소하고 있어요"
          text={`결제하지 못해 이미 묶인 HP를 돌려주고 있어요. ${followUp(order)}`}
          note={<ProcessingNote status={order.processingStatus} />}
          actions={ordersLink()}
        />
      )
    case 'HOLD_FAILED':
      return (
        <ResultPanel
          order={order}
          tone="bad"
          title="결제하지 못했어요"
          text={failedText(order)}
          actions={
            <>
              <RetryLink order={order} />
              {ordersLink()}
            </>
          }
        />
      )
    default:
      return (
        <ResultPanel
          order={order}
          tone="mute"
          title="주문 상태를 확인해 주세요"
          text="이 주문의 상태는 주문 내역에서 볼 수 있어요."
          actions={ordersLink(true)}
        />
      )
  }
}

/**
 * 결제 실패 안내. 실패 사유는 응답에 없다. 쿠폰을 쓴 주문은 쿠폰 예약이 거절됐을 수 있어 쿠폰을 다시 고르라고 덧붙인다
 */
function failedText(order: Order) {
  const base = '묶인 HP는 없어요. 잔액을 확인하고 다시 주문해 주세요.'
  return order.discountHp > 0 ? `${base} ${COUPON_RETRY}` : base
}

/** 결제 실패 주문을 다시 살 곳. 바로 구매는 장바구니에 없으므로 1건이면 강의로, 여러 건(장바구니 주문)이면 장바구니로 보낸다 */
function RetryLink({ order }: { order: Order }) {
  const [only] = order.items
  return order.items.length === 1 ? (
    <Link className="btn primary" to={`/lectures/${only.lectureId}`}>
      강의로 돌아가기
    </Link>
  ) : (
    <Link className="btn primary" to="/cart">
      장바구니로
    </Link>
  )
}

/** 항목 금액. 쿠폰을 쓴 항목은 가격·할인·결제액을 나눠 보인다 */
function OrderItemAmount({ item }: { item: OrderItem }) {
  if (item.discountHp === 0)
    return (
      <div className="row sub">
        <span>{item.lectureTitle}</span>
        <span className="num">{formatNumber(item.priceHp)}</span>
      </div>
    )
  return (
    <div role="group" aria-label={`${item.lectureTitle} 금액`}>
      <div className="row sub">
        <span>{item.lectureTitle}</span>
        <span className="num">{formatNumber(item.priceHp)}</span>
      </div>
      <div className="row sub">
        <span>쿠폰 할인</span>
        <span className="num">−{formatNumber(item.discountHp)}</span>
      </div>
      <div className="row sub">
        <span>결제액</span>
        <span className="num">{formatNumber(item.buyerAmountHp)}</span>
      </div>
    </div>
  )
}

type Tone = 'ok' | 'bad' | 'mute' | 'wait'

const ICON: Record<Tone, ReactNode> = {
  ok: '✓',
  bad: '!',
  mute: '?',
  wait: <span className="spinner" />,
}

function ResultPanel({
  order,
  tone,
  title,
  text,
  note,
  actions,
}: {
  order: Order
  tone: Tone
  title: string
  text: string
  note?: ReactNode
  actions: ReactNode
}) {
  return (
    <section className="panel result" aria-busy={tone === 'wait'}>
      <span className={`result-ico ${tone}`} aria-hidden="true">
        {ICON[tone]}
      </span>
      <h1>{title}</h1>
      <p className="lede">{text}</p>
      {note}
      <div className="breakdown">
        <div className="row sub">
          <span>주문 번호</span>
          <span className="num">{order.orderId}</span>
        </div>
        {order.items.map((item) => (
          <OrderItemAmount key={item.orderItemId} item={item} />
        ))}
        {order.discountHp > 0 && (
          <div className="row sub">
            <span>쿠폰 할인 합</span>
            <span className="num">−{formatNumber(order.discountHp)}</span>
          </div>
        )}
        <div className="row total">
          <span>{order.status === 'PAID' ? '결제한 HP' : '주문 금액'}</span>
          <b className="num">{formatNumber(order.buyerAmountHp)} HP</b>
        </div>
      </div>
      <div className="result-actions">{actions}</div>
    </section>
  )
}
