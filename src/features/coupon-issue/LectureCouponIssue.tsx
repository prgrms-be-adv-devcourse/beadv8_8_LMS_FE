import { useQuery } from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router'
import { lectureCouponsQuery } from '@/entities/coupon/api'
import {
  discountLabel,
  expiryRuleLabel,
  remainingOf,
} from '@/entities/coupon/rules'
import type { CouponSummary } from '@/entities/coupon/types'
import { CouponValue } from '@/entities/coupon/ui/CouponValue'
import { formatNumber } from '@/shared/lib/money'
import { Modal } from '@/shared/ui/Modal'
import { IssueCouponButton } from './IssueCouponButton'
import {
  bulkResultMessage,
  bulkResultOf,
  entryLabelOf,
  IDLE,
  issueButtonOf,
  issueMessageOf,
  tallyIssues,
  type BulkResult,
} from './issueView'
import styles from './LectureCouponIssue.module.css'
import { useIssueCoupon, type IssueCouponState } from './useIssueCoupon'

/** 쿠폰 한 장의 발급 손잡이. '모두 받기'는 issueAndWait로 한 장씩 결과(처리 중이 끝난 상태)를 기다린다 */
type IssueHandle = {
  issue: () => void
  /** 보내고 처리 중이 끝나면 그 상태로 풀린다. 그사이 쿠폰이 목록에서 빠지면 null */
  issueAndWait: () => Promise<IssueCouponState | null>
}

const FAILED_PHASES: IssueCouponState['phase'][] = [
  'failed',
  'rejected',
  'unknown',
]

/**
 * 강의 상세 구매 패널의 '쿠폰 받기'. 이 강의에 받을 수 있는 쿠폰(특정 강의 + 모든 강의)이 있으면 버튼을 보이고,
 * 누르면 팝업에서 한 장씩 또는 모두 받는다. 쿠폰이 없거나 불러오지 못하면 그리지 않는다(강의 화면을 막지 않는다).
 * 회원에게만 그린다(부르는 쪽이 정한다). 화면에 들어올 때 저절로 열지 않는다.
 */
export function LectureCouponIssue({ lectureId }: { lectureId: number }) {
  const { data: coupons } = useQuery(lectureCouponsQuery(lectureId))
  const [open, setOpen] = useState(false)
  // 발급 훅은 팝업 밖(IssueSlot)에 둔다. 팝업을 닫았다 열어도 요청 ID·진행 상태가 이어지고, 모두 받기도 멈추지 않는다.
  const [states, setStates] = useState<Record<number, IssueCouponState>>({})
  const handles = useRef(new Map<number, IssueHandle>())
  const running = useRef(false)
  const [bulk, setBulk] = useState<{ total: number; done: number } | null>(null)
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)

  const onState = useCallback(
    (couponId: number, state: IssueCouponState) =>
      setStates((prev) =>
        sameState(prev[couponId], state)
          ? prev
          : { ...prev, [couponId]: state },
      ),
    [],
  )
  const onHandle = useCallback(
    (couponId: number, handle: IssueHandle | null) => {
      if (handle) handles.current.set(couponId, handle)
      else handles.current.delete(couponId)
    },
    [],
  )

  if (!coupons || coupons.length === 0) return null

  const stateOf = (couponId: number) => states[couponId] ?? IDLE
  const tally = tallyIssues(coupons, stateOf)
  const entry = entryLabelOf(tally, coupons.length)
  const only = tally.requestable.length === 1 ? tally.requestable[0] : null

  /** 받을 수 있는 쿠폰을 한 장씩 보내고, 앞 쿠폰의 처리가 끝나면 다음으로 간다 */
  const issueAll = async () => {
    const targets = tally.requestable.map((c) => c.couponId)
    if (running.current || targets.length === 0) return
    running.current = true
    setBulkResult(null)
    setBulk({ total: targets.length, done: 0 })
    const settled: (IssueCouponState | null)[] = []
    for (const couponId of targets) {
      const handle = handles.current.get(couponId)
      settled.push(handle ? await handle.issueAndWait() : null)
      setBulk((b) => b && { ...b, done: b.done + 1 })
    }
    running.current = false
    setBulk(null)
    setBulkResult(bulkResultOf(settled))
  }

  const close = () => {
    setOpen(false)
    if (!running.current) setBulkResult(null)
  }

  const bulkStatus = bulk
    ? `받는 중 ${bulk.done}/${bulk.total}`
    : bulkResult
      ? bulkResultMessage(bulkResult)
      : ''
  const canIssueAll = tally.requestable.length > 0 || bulk !== null

  return (
    <>
      {coupons.map((coupon) => (
        <IssueSlot
          key={coupon.couponId}
          couponId={coupon.couponId}
          lectureId={lectureId}
          onState={onState}
          onHandle={onHandle}
        />
      ))}
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
          footer={
            <>
              <span role="status" className={styles.bulkStatus}>
                {bulkStatus}
              </span>
              {tally.received > 0 && (
                <Link
                  className={canIssueAll ? 'btn' : 'btn primary'}
                  to="/library/coupons"
                >
                  쿠폰함에서 보기
                </Link>
              )}
              {canIssueAll && (
                <button
                  type="button"
                  className="btn primary"
                  disabled={bulk !== null}
                  aria-busy={bulk !== null}
                  onClick={() => void issueAll()}
                >
                  {bulk && <span className="spinner sm" aria-hidden="true" />}
                  모두 받기
                </button>
              )}
            </>
          }
        >
          <p className={styles.lede}>
            받은 쿠폰은 쿠폰함에 모이고, 결제할 때 골라 쓸 수 있어요.
          </p>
          <div className={styles.list}>
            {coupons.map((coupon) => (
              <CouponTicket
                key={coupon.couponId}
                coupon={coupon}
                state={stateOf(coupon.couponId)}
                locked={bulk !== null}
                onIssue={() => handles.current.get(coupon.couponId)?.issue()}
              />
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}

function CouponTicket({
  coupon,
  state,
  locked,
  onIssue,
}: {
  coupon: CouponSummary
  state: IssueCouponState
  locked: boolean
  onIssue: () => void
}) {
  // 이미 받은 쿠폰(409)은 실패가 아니라 '받음'이다.
  const failed =
    FAILED_PHASES.includes(state.phase) &&
    issueButtonOf(coupon, state).label !== '받음'
  return (
    <div
      className={failed ? `${styles.ticket} ${styles.failed}` : styles.ticket}
      role="group"
      aria-label={coupon.name}
    >
      <div className={styles.stub}>
        <CouponValue
          discountType={coupon.discountType}
          discountValue={coupon.discountValue}
        />
      </div>
      <div className={styles.body}>
        <span className="row-title">
          {coupon.name}{' '}
          {coupon.stackable && (
            <span className="pill info">중복 사용 가능</span>
          )}
        </span>
        <span className={styles.discount}>{discountLabel(coupon)}</span>
        <span className="fine">
          {`${expiryRuleLabel(coupon)} · 남은 수량 ${formatNumber(remainingOf(coupon))}장`}
        </span>
      </div>
      <div className={styles.action}>
        <IssueCouponButton
          coupon={coupon}
          state={state}
          locked={locked}
          onIssue={onIssue}
        />
      </div>
      {/* 바뀌면 화면 낭독기가 읽도록 처음부터 그려 둔다 */}
      <p role="status" className={styles.message}>
        {issueMessageOf(state)}
      </p>
    </div>
  )
}

/**
 * 쿠폰 한 장의 발급 훅을 쥐고 상태와 손잡이를 위로 알린다(그리는 것은 없다).
 * issueAndWait는 보낸 차례(attempt)를 상태로 두어, 그 차례 이후에 그린 상태만 결과로 본다.
 */
function IssueSlot({
  couponId,
  lectureId,
  onState,
  onHandle,
}: {
  couponId: number
  lectureId: number
  onState: (couponId: number, state: IssueCouponState) => void
  onHandle: (couponId: number, handle: IssueHandle | null) => void
}) {
  const { state, issue } = useIssueCoupon(couponId, lectureId)
  const latestIssue = useRef(issue)
  useLayoutEffect(() => {
    latestIssue.current = issue
  })
  const sent = useRef(0)
  const [attempt, setAttempt] = useState(0)
  const waiter = useRef<{
    attempt: number
    resolve: (state: IssueCouponState | null) => void
  } | null>(null)

  useLayoutEffect(() => {
    onHandle(couponId, {
      issue: () => latestIssue.current(),
      issueAndWait: () =>
        new Promise((resolve) => {
          waiter.current?.resolve(null)
          sent.current += 1
          waiter.current = { attempt: sent.current, resolve }
          setAttempt(sent.current)
          latestIssue.current()
        }),
    })
    return () => {
      onHandle(couponId, null)
      waiter.current?.resolve(null)
      waiter.current = null
    }
  }, [couponId, onHandle])

  useEffect(() => {
    onState(couponId, state)
    const pending = waiter.current
    if (pending?.attempt === attempt && state.phase !== 'processing') {
      waiter.current = null
      pending.resolve(state)
    }
  }, [attempt, couponId, onState, state])

  return null
}

const sameState = (a: IssueCouponState | undefined, b: IssueCouponState) =>
  a !== undefined && JSON.stringify(a) === JSON.stringify(b)

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
