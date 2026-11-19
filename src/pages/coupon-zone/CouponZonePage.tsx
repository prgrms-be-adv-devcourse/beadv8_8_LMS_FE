import { useQueries, useQuery } from '@tanstack/react-query'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { issuableCouponsQuery } from '@/entities/coupon/api'
import type { CouponSummary } from '@/entities/coupon/types'
import { lectureQuery } from '@/entities/lecture/api'
import { BulkIssueActions } from '@/features/coupon-issue/BulkIssueActions'
import { IssueTicket } from '@/features/coupon-issue/IssueTicket'
import {
  useIssueBoard,
  type IssueBoard,
} from '@/features/coupon-issue/useIssueBoard'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError } from '@/shared/ui/QueryState'
import styles from './CouponZonePage.module.css'
import {
  groupIssuable,
  issuableOrder,
  lectureLookupOf,
  shownCount,
  zoneViewOf,
  type LectureCoupons,
  type LectureLookup,
} from './zone'

/**
 * 쿠폰 받기: 지금 받을 수 있는 쿠폰 전체를 모든 강의 쿠폰과 강의별 쿠폰으로 나눠 보이고, 한 장씩 또는 모두 받는다.
 * 받는 규칙(발급 접수·상태 조회, 모두 받기 순서)은 강의 상세의 쿠폰 받기 팝업과 같다.
 * 쿠폰 응답에 강의 제목이 없어 강의별 쿠폰은 강의마다 강의 상세를 불러온다. 판매가 끝났거나 없는 강의의 쿠폰은 뺀다.
 */
export function CouponZonePage() {
  const { data, error, refetch } = useQuery(issuableCouponsQuery())
  const groups = groupIssuable(data ?? [])
  const lectures = useQueries({
    queries: groups.byLecture.map((group) => lectureQuery(group.lectureId)),
  })
  const view = zoneViewOf(groups, (lectureId) => {
    const i = groups.byLecture.findIndex((g) => g.lectureId === lectureId)
    return lectures[i] ? lectureLookupOf(lectures[i]) : { state: 'loading' }
  })
  // 발급 상태는 목록 밖에 둔다. 받은 뒤 목록을 다시 불러오다 실패해도 이미 받은 목록과 진행 중인 모두 받기를 유지한다.
  const board = useIssueBoard(issuableOrder(view))

  return (
    <div className="page">
      {board.slots}
      <PageHead
        title="쿠폰 받기"
        lede="지금 받을 수 있는 쿠폰을 모았어요. 받은 쿠폰은 쿠폰함에 모이고, 결제할 때 골라 쓸 수 있어요."
      />
      {data ? (
        shownCount(view) > 0 ? (
          <>
            {view.anyLecture.length > 0 && (
              <ZoneSection
                title="모든 강의 쿠폰"
                hint="어느 강의를 결제하든 쓸 수 있어요."
                count={view.anyLecture.length}
              >
                <Tickets coupons={view.anyLecture} board={board} />
              </ZoneSection>
            )}
            {view.byLecture.length > 0 && (
              <ZoneSection
                title="강의별 쿠폰"
                hint="그 강의를 결제할 때만 쓸 수 있어요."
                count={view.byLecture.reduce(
                  (sum, group) => sum + group.coupons.length,
                  0,
                )}
              >
                <div className={styles.lectures}>
                  {view.byLecture.map((group) => (
                    <LectureGroup
                      key={group.lectureId}
                      group={group}
                      lecture={group.lecture}
                      board={board}
                    />
                  ))}
                </div>
              </ZoneSection>
            )}
            {view.other.length > 0 && (
              <ZoneSection title="그 밖의 쿠폰" count={view.other.length}>
                <Tickets coupons={view.other} board={board} />
              </ZoneSection>
            )}
            <ActionBar board={board} />
          </>
        ) : (
          <EmptyState
            title="지금 받을 수 있는 쿠폰이 없어요"
            action={
              <Link className="btn primary" to="/lectures">
                강의 보러 가기
              </Link>
            }
          >
            새 쿠폰이 열리면 여기에 모여요.
          </EmptyState>
        )
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : (
        <ZoneSkeleton />
      )}
    </div>
  )
}

function ZoneSection({
  title,
  hint,
  count,
  children,
}: {
  title: string
  hint?: string
  count: number
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.sectionHead}>
        <h2 id={headingId}>{title}</h2>
        <span className={styles.count}>
          <span className="num">{count}</span>장
        </span>
        {hint && <p className={styles.hint}>{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Tickets({
  coupons,
  board,
}: {
  coupons: CouponSummary[]
  board: IssueBoard
}) {
  return (
    <div className={styles.tickets}>
      {coupons.map((coupon) => (
        <IssueTicket
          key={coupon.couponId}
          coupon={coupon}
          state={board.stateOf(coupon.couponId)}
          locked={board.bulk !== null}
          onIssue={() => board.issue(coupon.couponId)}
        />
      ))}
    </div>
  )
}

/**
 * 한 강의의 쿠폰. 강의를 확인하는 동안은 자리만 잡고(판매가 끝난 강의면 빠진다), 못 불러왔으면 제목 없이 강의 보기만 둔다
 */
function LectureGroup({
  group,
  lecture,
  board,
}: {
  group: LectureCoupons
  lecture: LectureLookup
  board: IssueBoard
}) {
  const titleId = useId()
  if (lecture.state === 'loading')
    return (
      <div className={styles.lecture} aria-hidden="true">
        <div className={styles.lectureHead}>
          <span className={`skeleton ${styles.iconSkeleton}`} />
          <span className={`skeleton title ${styles.titleSkeleton}`} />
        </div>
        <div className={styles.tickets}>
          {group.coupons.map((coupon) => (
            <SkeletonTicket key={coupon.couponId} />
          ))}
        </div>
      </div>
    )
  const title = lecture.state === 'found' ? lecture.title : null
  return (
    <div
      className={styles.lecture}
      role="group"
      aria-labelledby={title ? titleId : undefined}
    >
      <div className={styles.lectureHead}>
        <span className={styles.lectureIcon} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM10.5 9.5v5l4-2.5z" />
          </svg>
        </span>
        {title && (
          <h3 id={titleId} className={styles.lectureTitle}>
            {title}
          </h3>
        )}
        <Link
          className={`btn sm ${styles.lectureLink}`}
          to={`/lectures/${group.lectureId}`}
          aria-describedby={title ? titleId : undefined}
        >
          강의 보기
          <svg
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
        </Link>
      </div>
      <Tickets coupons={group.coupons} board={board} />
    </div>
  )
}

/** 목록 아래에 붙는 줄: 받을 수 있는 수, 모두 받기 진행·결과, 쿠폰함에서 보기, 모두 받기 */
function ActionBar({ board }: { board: IssueBoard }) {
  const { tally, bulk, bulkResult } = board
  if (
    tally.requestable.length === 0 &&
    tally.received === 0 &&
    !bulk &&
    !bulkResult
  )
    return null
  const idle = !bulk && !bulkResult && tally.requestable.length > 0
  return (
    <div className={styles.bar}>
      {idle && (
        <p className={styles.barHint}>
          받을 수 있는 쿠폰 <b className="num">{tally.requestable.length}</b>장
        </p>
      )}
      <BulkIssueActions board={board} />
    </div>
  )
}

/** 처음 불러오는 중: 구역 머리와 티켓 자리를 잡아 둔다 */
function ZoneSkeleton() {
  return (
    <div className={styles.section} role="status">
      <span className="sr-only">불러오는 중…</span>
      <div className={styles.skeletonHead} aria-hidden="true">
        <span className="skeleton title" />
      </div>
      <div className={styles.tickets} aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonTicket key={i} />
        ))}
      </div>
    </div>
  )
}

/** 티켓 모양 뼈대(장식) */
function SkeletonTicket() {
  return (
    <div className={styles.skeletonTicket}>
      <span className={styles.skeletonStub} />
      <span className="skeleton-stack">
        <span className="skeleton text w-70" />
        <span className="skeleton text w-50" />
        <span className="skeleton text" />
      </span>
      <span className="skeleton action" />
    </div>
  )
}
