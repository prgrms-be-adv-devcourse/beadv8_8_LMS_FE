import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { orderQuery } from '@/entities/order/api'
import { formatDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { LoadError, Loading } from '@/shared/ui/QueryState'

export function OrderDonePage() {
  const orderId = Number(useParams().orderId)
  const {
    data: order,
    error,
    isPending,
    refetch,
  } = useQuery(orderQuery(orderId))

  if (isPending)
    return (
      <div className="page narrow">
        <Loading />
      </div>
    )
  if (error)
    return (
      <div className="page narrow">
        <LoadError error={error} retry={refetch} />
      </div>
    )

  const cancelUntil = order.items[0]?.autoConfirmAt
  return (
    <div className="page narrow">
      <section className="panel result">
        <span className="result-ico ok" aria-hidden="true">
          ✓
        </span>
        <h1>주문을 마쳤어요</h1>
        <p className="lede">
          내 강의에서 바로 볼 수 있어요.
          {cancelUntil &&
            ` 재생하거나 자료를 받기 전이면 ${formatDate(cancelUntil)} 전까지 구매 취소할 수 있어요.`}
        </p>
        <div className="breakdown">
          <div className="row sub">
            <span>주문 번호</span>
            <span className="num">{order.orderId}</span>
          </div>
          {order.items.map((item) => (
            <div key={item.orderItemId} className="row sub">
              <span>{item.lectureTitle}</span>
              <span className="num">{formatNumber(item.priceHp)}</span>
            </div>
          ))}
          <div className="row total">
            <span>결제한 HP</span>
            <b className="num">{formatNumber(order.totalAmountHp)} HP</b>
          </div>
        </div>
        <div className="result-actions">
          <Link className="btn primary" to="/library">
            내 강의로
          </Link>
          <Link className="btn" to="/library/orders">
            주문 내역
          </Link>
          <Link className="btn ghost" to="/lectures">
            강의 더 보기
          </Link>
        </div>
      </section>
    </div>
  )
}
