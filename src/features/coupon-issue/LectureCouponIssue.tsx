import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { lectureCouponsQuery } from '@/entities/coupon/api'
import { discountLabel } from '@/entities/coupon/rules'
import { Modal } from '@/shared/ui/Modal'
import { BulkIssueActions } from './BulkIssueActions'
import { entryLabelOf } from './issueView'
import { IssueTicket } from './IssueTicket'
import styles from './LectureCouponIssue.module.css'
import { useIssueBoard } from './useIssueBoard'

/**
 * 강의 상세 구매 패널의 '쿠폰 받기'. 이 강의에 받을 수 있는 쿠폰(특정 강의 + 모든 강의)이 있으면 버튼을 보이고,
 * 누르면 팝업에서 한 장씩 또는 모두 받는다. 쿠폰이 없거나 불러오지 못하면 그리지 않는다(강의 화면을 막지 않는다).
 * 회원에게만 그린다(부르는 쪽이 정한다). 화면에 들어올 때 저절로 열지 않는다.
 */
export function LectureCouponIssue({ lectureId }: { lectureId: number }) {
  const { data: coupons } = useQuery(lectureCouponsQuery(lectureId))
  const [open, setOpen] = useState(false)
  // 발급 상태는 팝업 밖에 둔다. 팝업을 닫았다 열어도 요청 ID·진행 상태가 이어지고, 모두 받기도 멈추지 않는다.
  const board = useIssueBoard(coupons ?? [])

  if (!coupons || coupons.length === 0) return null

  const { tally, stateOf } = board
  const entry = entryLabelOf(tally, coupons.length)
  const only = tally.requestable.length === 1 ? tally.requestable[0] : null

  const close = () => {
    setOpen(false)
    board.clearResult()
  }

  return (
    <>
      {board.slots}
      <button
        type="button"
        className={styles.entry}
        aria-haspopup="dialog"
        // 안의 글자가 붙어 읽히지 않게 이름을 정해 둔다(할인 안내는 팝업에서 다시 읽는다).
        aria-label={`${entry.label} ${entry.count}장`}
        onClick={() => setOpen(true)}
      >
        <TicketIcon />
        <span className={styles.entryText}>
          <b>{entry.label}</b>
          {only && (
            <span className={styles.entryHint}>{discountLabel(only)}</span>
          )}
        </span>
        <span className={styles.entryCount}>
          <span className="num">{entry.count}</span>장
        </span>
        <svg
          className={styles.chevron}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 3.5 10.5 8 6 12.5" />
        </svg>
      </button>
      {open && (
        <Modal
          title="받을 수 있는 쿠폰"
          onClose={close}
          footer={<BulkIssueActions board={board} />}
        >
          <p className={styles.lede}>
            받은 쿠폰은 쿠폰함에 모이고, 결제할 때 골라 쓸 수 있어요.
          </p>
          <div className={styles.list}>
            {coupons.map((coupon) => (
              <IssueTicket
                key={coupon.couponId}
                coupon={coupon}
                state={stateOf(coupon.couponId)}
                locked={board.bulk !== null}
                onIssue={() => board.issue(coupon.couponId)}
              />
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}

function TicketIcon() {
  return (
    <svg
      className={styles.ticketIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4Z" />
      <path d="M9 6v12" strokeDasharray="2 2.4" />
    </svg>
  )
}
