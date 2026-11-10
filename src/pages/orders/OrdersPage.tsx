import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { orderQuery, ordersQuery } from '@/entities/order/api'
import { COUPON_RETRY } from '@/entities/order/discount'
import { itemProcessingStatus } from '@/entities/order/processing'
import type {
  OrderItem,
  OrderStatus,
  OrderSummary,
} from '@/entities/order/types'
import { OrderItemStatusPill } from '@/entities/order/ui/OrderItemStatusPill'
import { ProcessingNote } from '@/entities/order/ui/ProcessingNote'
import { CancelPurchaseModal } from '@/features/purchase/PurchaseModals'
import { formatDate, isPast } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { lookup } from '@/shared/lib/statusLabel'
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

/** 주문 머리의 주문 상태 안내. 결제 처리 중과 결제 완료는 항목 상태 배지로 충분하다 */
const ORDER_NOTE: Record<OrderStatus, string | null> = {
  HOLD_PENDING: null,
  HOLD_COMPENSATING: null,
  HOLD_FAILED: '결제하지 못한 주문이에요 · 묶인 HP 없음',
  PAID: null,
  CANCELED: '전부 취소·반환됨',
}

function OrderCard({ summary }: { summary: OrderSummary }) {
  // 처리 중인 주문은 주문 상세만 다시 부르므로(orderQuery), 상태는 불러온 주문 상세를 먼저 본다.
  // 다시 불러오다 실패해도 이미 받은 주문 상세를 그대로 보인다.
  const { data: order, error, refetch } = useQuery(orderQuery(summary.orderId))
  const [canceling, setCanceling] = useState<OrderItem | null>(null)
  const status = order?.status ?? summary.status
  const orderNote = lookup(ORDER_NOTE, status)
  const discounted = order !== undefined && order.discountHp > 0

  return (
    <section className="panel" aria-label={`주문 번호 ${summary.orderId}`}>
      <div className="panel-head">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <b>{formatDate(summary.orderedAt)} 주문</b>
          <span className="fine num">주문 번호 {summary.orderId}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          {/* 목록 한 줄에는 할인이 없다. 상세를 받으면 결제액(할인 뒤)을 굵게, 그 전·실패하면 할인 전 합임을 밝힌다 */}
          {order ? (
            <b className="num">{formatNumber(order.buyerAmountHp)} HP</b>
          ) : (
            <span className="num">
              주문 금액(할인 전) {formatNumber(summary.totalAmountHp)} HP
            </span>
          )}
          {discounted && (
            <div className="fine num">
              {formatNumber(order.discountHp)} HP 할인
            </div>
          )}
          {orderNote && (
            <div className="fine">
              {orderNote}
              {discounted && status === 'HOLD_FAILED' && ` · ${COUPON_RETRY}`}
            </div>
          )}
        </div>
      </div>
      <ProcessingNote
        status={order ? order.processingStatus : summary.processingStatus}
      />
      {order ? (
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
                  {item.discountHp > 0
                    ? `${formatNumber(item.priceHp)} HP · ${formatNumber(item.discountHp)} HP 할인 · 결제 ${formatNumber(item.buyerAmountHp)} HP`
                    : `${formatNumber(item.priceHp)} HP`}
                </span>
                <ProcessingNote status={itemProcessingStatus(item)} />
              </div>
              <OrderItemStatusPill status={item.status} />
              {item.status === 'PURCHASED' &&
                item.objectionStatus === 'NONE' &&
                item.autoConfirmAt !== null &&
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
      ) : error ? (
        <LoadError error={error} retry={refetch} />
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
          refundHp={canceling.buyerAmountHp}
          onClose={() => setCanceling(null)}
        />
      )}
    </section>
  )
}
