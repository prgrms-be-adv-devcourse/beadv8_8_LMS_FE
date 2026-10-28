import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { LectureThumb } from '@/entities/lecture/ui/LectureThumb'
import { orderQuery, purchasedQuery } from '@/entities/order/api'
import type { OrderItem, PurchasedLecture } from '@/entities/order/types'
import { OrderItemStatusPill } from '@/entities/order/ui/OrderItemStatusPill'
import {
  CancelPurchaseModal,
  ConfirmPurchaseModal,
  PlayConsentModal,
} from '@/features/purchase/PurchaseModals'
import { formatDate, isPast } from '@/shared/lib/date'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'

type ModalState = {
  type: 'consent' | 'confirm' | 'cancel'
  lecture: PurchasedLecture
  item?: OrderItem
} | null

export function LibraryPage() {
  const { data, error, isPending, refetch } = useQuery(purchasedQuery)
  const [modal, setModal] = useState<ModalState>(null)
  const navigate = useNavigate()
  const close = () => setModal(null)

  return (
    <div className="page">
      <PageHead
        title="내 강의"
        lede="재생하거나 자료를 받으면 구매가 확정돼요. 확정 전에는 단순 변심으로 구매 취소할 수 있어요."
        actions={
          <Link className="btn" to="/library/orders">
            주문 내역
          </Link>
        }
      />
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState
          title="아직 산 강의가 없어요"
          action={
            <Link className="btn primary" to="/lectures">
              강의 둘러보기
            </Link>
          }
        >
          인증된 인플루언서가 만든 방송 강의를 둘러보세요. 재생 전이면 7일 안에
          취소할 수 있어요.
        </EmptyState>
      ) : (
        <section className="panel">
          <div className="rows">
            {data.content.map((lecture) => (
              <LibraryRow
                key={lecture.orderItemId}
                lecture={lecture}
                onAction={(type, item) => setModal({ type, lecture, item })}
                onWatch={() => navigate(`/library/${lecture.lectureId}/watch`)}
              />
            ))}
          </div>
        </section>
      )}

      {modal && (
        <LibraryModal
          modal={modal}
          onClose={close}
          onConsented={() =>
            navigate(`/library/${modal.lecture.lectureId}/watch`)
          }
        />
      )}
    </div>
  )
}

function LibraryRow({
  lecture,
  onAction,
  onWatch,
}: {
  lecture: PurchasedLecture
  onAction: (type: 'consent' | 'confirm' | 'cancel', item?: OrderItem) => void
  onWatch: () => void
}) {
  // 기한(구매 취소·이의 제기·지급)은 주문 상세에만 있다. 같은 주문은 한 번만 부른다.
  const { data: order } = useQuery(orderQuery(lecture.orderId))
  const item = order?.items.find((i) => i.orderItemId === lecture.orderItemId)
  const before = lecture.itemStatus === 'PURCHASED'
  const cancelable =
    before &&
    item !== undefined &&
    item.objectionStatus === 'NONE' &&
    !isPast(item.autoConfirmAt)
  const objectionOpen =
    !before && item !== undefined && !isPast(item.payoutScheduledAt)

  return (
    <div className="row-item">
      <LectureThumb
        lectureId={lecture.lectureId}
        title={lecture.title}
        thumbnailUrl={lecture.thumbnailUrl}
        size="sm"
      />
      <div className="row-main">
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span className="row-title">{lecture.title}</span>
          <OrderItemStatusPill status={lecture.itemStatus} />
          {lecture.lectureDeleted && (
            <span className="pill mute">판매 종료</span>
          )}
        </div>
        {item && (
          <>
            <span className="fine">
              {before
                ? `${formatDate(item.autoConfirmAt)} 전까지 구매 취소할 수 있어요`
                : objectionOpen
                  ? `내용 다름 이의 제기 ${formatDate(item.payoutScheduledAt)} 전까지`
                  : '이의 제기 기간이 끝났어요'}
            </span>
            <div className="timeline">
              <span>구매 {formatDate(item.purchasedAt)}</span>
              <span className={before ? 'hit' : undefined}>
                확정 기한 {formatDate(item.autoConfirmAt)}
              </span>
              <span className={objectionOpen ? 'hit' : undefined}>
                판매자 지급 {formatDate(item.payoutScheduledAt)}
              </span>
            </div>
          </>
        )}
      </div>
      <div className="row-actions">
        <button
          type="button"
          className="btn primary sm"
          onClick={() => (before ? onAction('consent', item) : onWatch())}
        >
          재생
        </button>
        {before && (
          <button
            type="button"
            className="btn sm"
            onClick={() => onAction('confirm', item)}
          >
            구매 확정
          </button>
        )}
        {cancelable && (
          <button
            type="button"
            className="btn danger sm"
            onClick={() => onAction('cancel', item)}
          >
            구매 취소
          </button>
        )}
        {!before && (
          <Link className="btn sm" to={`/library/${lecture.lectureId}/review`}>
            리뷰
          </Link>
        )}
        {objectionOpen && (
          <Link className="btn ghost sm" to="/support">
            내용 다름 이의 제기
          </Link>
        )}
      </div>
    </div>
  )
}

function LibraryModal({
  modal,
  onClose,
  onConsented,
}: {
  modal: NonNullable<ModalState>
  onClose: () => void
  onConsented: () => void
}) {
  const ref = {
    orderId: modal.lecture.orderId,
    orderItemId: modal.lecture.orderItemId,
    title: modal.lecture.title,
  }
  if (modal.type === 'consent')
    return (
      <PlayConsentModal
        item={ref}
        payoutScheduledAt={modal.item?.payoutScheduledAt}
        onClose={onClose}
        onConsented={onConsented}
      />
    )
  if (modal.type === 'confirm')
    return (
      <ConfirmPurchaseModal
        item={ref}
        payoutScheduledAt={modal.item?.payoutScheduledAt}
        onClose={onClose}
      />
    )
  return (
    <CancelPurchaseModal
      item={ref}
      priceHp={modal.item?.priceHp}
      onClose={onClose}
    />
  )
}
