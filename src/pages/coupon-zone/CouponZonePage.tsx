import { useQuery } from '@tanstack/react-query'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { issuableCouponsQuery } from '@/entities/coupon/api'
import type { IssuableCoupon } from '@/entities/coupon/types'
import { BulkIssueActions } from '@/features/coupon-issue/BulkIssueActions'
import { IssueTicket } from '@/features/coupon-issue/IssueTicket'
import {
  useIssueBoard,
  type IssueBoard,
} from '@/features/coupon-issue/useIssueBoard'
import { isApiError } from '@/shared/api/ApiError'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError } from '@/shared/ui/QueryState'
import styles from './CouponZonePage.module.css'
import { groupIssuable, issuableOrder, type LectureCoupons } from './zone'

/**
 * 쿠폰 받기: 지금 받을 수 있는 쿠폰을 쪽 단위로 불러와 그 쪽 안에서 모든 강의 쿠폰과 강의별 쿠폰으로 나눠 보이고,
 * 한 장씩 또는 그 쪽의 쿠폰을 모두 받는다. 받는 규칙(발급 접수·상태 조회, 모두 받기 순서)은 강의 상세의 쿠폰 받기 팝업과 같다.
 * 판매 중이 아닌 강의의 쿠폰은 BE가 빼고, 강의 제목도 함께 준다.
 */
export function CouponZonePage() {
  const [page, setPage] = usePageParam('page')
  const query = useQuery(issuableCouponsQuery(page))
  const { data, error, refetch, isPlaceholderData: turning } = query
  const moving = useClampPage(page, query, setPage)
  const groups = groupIssuable(data?.content ?? [])
  const coupons = issuableOrder(groups)
  // 발급 상태는 목록 밖에 둔다. 받은 뒤 목록을 다시 불러오다 실패해도 이미 받은 목록과 진행 중인 모두 받기를 유지한다.
  const board = useIssueBoard(coupons)
  // 발급 상태(요청 ID·결과 확인)는 지금 쪽의 쿠폰에만 있어, 받는 중인 쿠폰이 있으면(모두 받기 포함) 쪽을 넘기지 않는다.
  const issuing =
    board.bulk !== null ||
    coupons.some((c) => board.stateOf(c.couponId).phase === 'processing')
  // 쪽을 넘기는 동안 보이는 것은 이전 쪽이라, 새 쪽이 올 때까지 흐리게 두고 받기를 막는다.
  const locked = board.bulk !== null || turning

  return (
    <div className="page">
      {board.slots}
      <PageHead
        title="쿠폰 받기"
        lede="지금 받을 수 있는 쿠폰을 모았어요. 받은 쿠폰은 쿠폰함에 모이고, 결제할 때 골라 쓸 수 있어요."
      />
      {data && !moving ? (
        data.content.length > 0 ? (
          <>
            {groups.anyLecture.length > 0 && (
              <ZoneSection
                title="모든 강의 쿠폰"
                hint="어느 강의를 결제하든 쓸 수 있어요."
                count={groups.anyLecture.length}
                busy={turning}
              >
                <Tickets
                  coupons={groups.anyLecture}
                  board={board}
                  locked={locked}
                />
              </ZoneSection>
            )}
            {groups.byLecture.length > 0 && (
              <ZoneSection
                title="강의별 쿠폰"
                hint="그 강의를 결제할 때만 쓸 수 있어요."
                count={groups.byLecture.reduce(
                  (sum, group) => sum + group.coupons.length,
                  0,
                )}
                busy={turning}
              >
                <div className={styles.lectures}>
                  {groups.byLecture.map((group) => (
                    <LectureGroup
                      key={group.lectureId}
                      group={group}
                      board={board}
                      locked={locked}
                    />
                  ))}
                </div>
              </ZoneSection>
            )}
            {groups.other.length > 0 && (
              <ZoneSection
                title="그 밖의 쿠폰"
                count={groups.other.length}
                busy={turning}
              >
                <Tickets coupons={groups.other} board={board} locked={locked} />
              </ZoneSection>
            )}
            <p role="status" className="sr-only">
              {turning ? '쿠폰을 불러오는 중…' : ''}
            </p>
            {/* 지난 모두 받기 결과는 그 쪽의 것이라 넘기면 지운다. 쪽 번호는 새 쪽을 기다리는 동안에도 고른 쪽을 가리킨다 */}
            {!issuing && (
              <Pager
                page={page}
                totalPages={data.page.totalPages}
                onChange={(next) => {
                  board.clearResult()
                  setPage(next)
                }}
              />
            )}
            <ActionBar
              board={board}
              paged={data.page.totalPages > 1}
              locked={turning}
            />
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
      ) : error && !data ? (
        isApiError(error, 'LECTURE_CATALOG_UNAVAILABLE') ? (
          <EmptyState
            role="alert"
            art="error"
            title="지금은 쿠폰을 불러올 수 없어요"
            action={
              <button type="button" className="btn" onClick={() => refetch()}>
                다시 시도
              </button>
            }
          >
            강의 정보를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.
          </EmptyState>
        ) : (
          <LoadError error={error} retry={refetch} />
        )
      ) : (
        <ZoneSkeleton />
      )}
    </div>
  )
}

/** 쿠폰 구역. busy면 다른 쪽을 불러오는 중이라 흐리게 둔다 */
function ZoneSection({
  title,
  hint,
  count,
  busy,
  children,
}: {
  title: string
  hint?: string
  count: number
  busy: boolean
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section
      className={busy ? `${styles.section} ${styles.stale}` : styles.section}
      aria-labelledby={headingId}
      aria-busy={busy || undefined}
    >
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
  locked,
}: {
  coupons: IssuableCoupon[]
  board: IssueBoard
  locked: boolean
}) {
  return (
    <div className={styles.tickets}>
      {coupons.map((coupon) => (
        <IssueTicket
          key={coupon.couponId}
          coupon={coupon}
          state={board.stateOf(coupon.couponId)}
          locked={locked}
          onIssue={() => board.issue(coupon.couponId)}
        />
      ))}
    </div>
  )
}

/** 한 강의의 쿠폰. 강의 제목이 없으면 제목 없이 강의 보기만 둔다 */
function LectureGroup({
  group,
  board,
  locked,
}: {
  group: LectureCoupons
  board: IssueBoard
  locked: boolean
}) {
  const titleId = useId()
  const title = group.lectureTitle
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
      <Tickets coupons={group.coupons} board={board} locked={locked} />
    </div>
  )
}

/**
 * 목록 아래에 붙는 줄: 받을 수 있는 수, 모두 받기 진행·결과, 쿠폰함에서 보기, 모두 받기.
 * 모두 받기는 지금 쪽만 보내므로 쪽이 여럿이면 이 쪽의 수라고 밝힌다
 */
function ActionBar({
  board,
  paged,
  locked,
}: {
  board: IssueBoard
  paged: boolean
  locked: boolean
}) {
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
          {paged ? '이 쪽에서 받을 수 있는 쿠폰' : '받을 수 있는 쿠폰'}{' '}
          <b className="num">{tally.requestable.length}</b>장
        </p>
      )}
      <BulkIssueActions board={board} locked={locked} />
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
