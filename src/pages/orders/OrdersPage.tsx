import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { orderQuery, ordersQuery } from '@/entities/order/api'
import type { OrderItem, OrderSummary } from '@/entities/order/types'
import { OrderItemStatusPill } from '@/entities/order/ui/OrderItemStatusPill'
import { CancelPurchaseModal } from '@/features/purchase/PurchaseModals'
import { formatDate, isPast } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'

export function OrdersPage() {
  const [page, setPage] = usePageParam('page')
  const query = useQuery(ordersQuery(page))
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, refetch } = query

  return (
    <div className="page">
      <Link className="back" to="/library">
        ← 내 강의
      </Link>
      <PageHead
        title="주문 내역"
        lede="장바구니나 바로 구매로 만든 주문이에요. 주문 안의 강의는 하나씩 구매 확정되고 취소돼요."
      />
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState
          title="주문 내역이 없어요"
          action={
            <Link className="btn primary" to="/lectures">
              강의 둘러보기
            </Link>
          }
        />
      ) : (
        <>
          {data.content.map((summary) => (
            <OrderCard key={summary.orderId} summary={summary} />
          ))}
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={setPage}
          />
        </>
      )}
    </div>
  )
}

function OrderCard({ summary }: { summary: OrderSummary }) {
  const { data: order, error, refetch } = useQuery(orderQuery(summary.orderId))
  const [canceling, setCanceling] = useState<OrderItem | null>(null)

  return (
    <section className="panel">
      <div className="panel-head">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <b>{formatDate(summary.orderedAt)} 주문</b>
          <span className="fine num">주문 번호 {summary.orderId}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <b className="num">{formatNumber(summary.totalAmountHp)} HP</b>
          {summary.status === 'CANCELED' && (
            <div className="fine">전부 취소·반환됨</div>
          )}
        </div>
      </div>
      {error ? (
        <LoadError error={error} retry={refetch} />
      ) : order ? (
        <div className="rows">
          {order.items.map((item) => (
            <div
              key={item.orderItemId}
              className="row-item"
              style={{ padding: '10px 0' }}
            >
              <div className="row-main">
                <span className="row-title">{item.lectureTitle}</span>
                <span className="fine num">
                  {formatNumber(item.priceHp)} HP
                </span>
              </div>
              <OrderItemStatusPill status={item.status} />
              {item.status === 'PURCHASED' &&
                item.objectionStatus === 'NONE' &&
                !isPast(item.autoConfirmAt) && (
                  <button
                    type="button"
                    className="btn danger sm"
                    onClick={() => setCanceling(item)}
                  >
                    구매 취소
                  </button>
                )}
            </div>
          ))}
        </div>
      ) : (
        <p className="fine">
          {summary.representativeTitle}
          {summary.itemCount > 1 && ` 외 ${summary.itemCount - 1}개`}
        </p>
      )}
      {canceling && (
        <CancelPurchaseModal
          item={{
            orderId: summary.orderId,
            orderItemId: canceling.orderItemId,
            title: canceling.lectureTitle,
          }}
          priceHp={canceling.priceHp}
          onClose={() => setCanceling(null)}
        />
      )}
    </section>
  )
}
