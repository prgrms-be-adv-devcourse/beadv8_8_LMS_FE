import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { appearanceHpTasksQuery } from '@/entities/appearance-hp-task/api'
import {
  APPEARANCE_HP_TASK_STATUS_FILTERS,
  appearanceHpTaskReasonName,
  appearanceHpTaskRefName,
  appearanceHpTaskTypeName,
} from '@/entities/appearance-hp-task/labels'
import type { AppearanceHpTask } from '@/entities/appearance-hp-task/types'
import { AppearanceHpTaskStatusPill } from '@/entities/appearance-hp-task/ui/AppearanceHpTaskStatusPill'
import {
  useAppearanceHpTaskRetrying,
  useRetryAppearanceHpTask,
} from '@/features/appearance-hp-task-admin/useRetryAppearanceHpTask'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AdminAppearanceHpTasksPage.module.css'

type StatusFilter = (typeof APPEARANCE_HP_TASK_STATUS_FILTERS)[number]

/**
 * 상태는 URL에 둔다(?status=). 기본은 멈춤이고, 바꾸면 첫 페이지로 간다. 없거나 모르는 값은 멈춤으로 본다.
 * 페이지는 usePageParam이 맡는다.
 */
function useStatusParam() {
  const [params, setParams] = useSearchParams()
  const filter: StatusFilter =
    APPEARANCE_HP_TASK_STATUS_FILTERS.find(
      (f) => f.status === params.get('status'),
    ) ?? APPEARANCE_HP_TASK_STATUS_FILTERS[0]
  const update = (next: StatusFilter['status']) => {
    const search = new URLSearchParams()
    if (next !== 'DEAD') search.set('status', next)
    setParams(search)
  }
  return { filter, update }
}

export function AdminAppearanceHpTasksPage() {
  const { filter, update } = useStatusParam()
  const [page, setPage] = usePageParam('page')
  const query = useQuery(
    appearanceHpTasksQuery({ status: filter.status, page }),
  )
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, refetch } = query

  return (
    <div className="page">
      <PageHead
        title="출연 HP 작업"
        lede="출연 요청서·모집글·출연의 보류 HP 반환·위약금 정산·지급 요청이에요. 실패하면 자동으로 다시 시도하고, 지갑이 거절하거나 재시도를 다 써도 실패하면 자동 처리가 멈춰요. 멈춘 작업은 원인을 고친 뒤 다시 시도하면 같은 요청 ID로 바로 한 번 보내요."
      />
      <div className="toolbar">
        <div role="group" aria-label="작업 상태" className={styles.filters}>
          {APPEARANCE_HP_TASK_STATUS_FILTERS.map((f) => (
            <button
              key={f.status}
              type="button"
              className={
                filter.status === f.status ? 'btn sm primary' : 'btn sm'
              }
              aria-pressed={filter.status === f.status}
              onClick={() => update(f.status)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState title={filter.empty} />
      ) : (
        <section className="panel">
          <ul className={styles.list} aria-label="출연 HP 작업 목록">
            {data.content.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </ul>
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={setPage}
          />
        </section>
      )}
    </div>
  )
}

/** 상세 API가 없어 한 줄에 작업의 모든 정보를 싣는다 */
function TaskItem({ task }: { task: AppearanceHpTask }) {
  return (
    <li className="q-item" aria-label={`출연 HP 작업 #${task.id}`}>
      <div className="row-main">
        <div className={styles.head}>
          <AppearanceHpTaskStatusPill status={task.status} />
          <b>
            #{task.id} {appearanceHpTaskTypeName(task.taskType)} ·{' '}
            {appearanceHpTaskReasonName(task.reason)}
          </b>
        </div>
        <span className="fine">
          {appearanceHpTaskRefName(task.refType)} #{task.refId}
          {task.appearanceId !== null && ` · 출연 #${task.appearanceId}`} ·
          호스트 회원 #{task.memberId}
          {task.receiverId !== null && ` · 게스트 회원 #${task.receiverId}`}
        </span>
        <span className="fine">{amountText(task)}</span>
        <span className="fine">
          시도 {task.attemptCount}회{timeText(task)}
        </span>
        {task.lastError && (
          <span className={`fine ${styles.code}`}>
            마지막 오류: {task.lastError}
          </span>
        )}
        {task.manualRetryCount > 0 && (
          <span className="fine">
            관리자 다시 시도 {task.manualRetryCount}회
            {task.lastManualRetryAt &&
              ` · 마지막 ${formatDateTime(task.lastManualRetryAt)}`}
            {task.lastManualRetryBy !== null &&
              ` · 관리자 #${task.lastManualRetryBy}`}
          </span>
        )}
        <span className={`fine ${styles.code}`}>
          요청 ID {task.idempotencyKey}
        </span>
      </div>
      {task.status === 'DEAD' && (
        <div className="row-actions">
          <RetryButton taskId={task.id} />
        </div>
      )}
    </li>
  )
}

/** 금액: 위약금 정산은 기준 출연료와 위약금, 그 밖에는 옮기는 HP(받는 몫이 다를 때만 덧붙인다) */
function amountText(task: AppearanceHpTask) {
  const amount = `${formatNumber(task.amount)} HP`
  if (task.payoutAmount === null) return amount
  const payout = `${formatNumber(task.payoutAmount)} HP`
  if (task.taskType === 'PENALTY')
    return `기준 출연료 ${amount} · 위약금 ${payout}(게스트에게)`
  if (task.payoutAmount === task.amount) return amount
  return `${amount} · 받는 몫 ${payout}`
}

/** 상태별 시각: 대기는 다음 시도, 멈춤은 멈춘 시각, 완료는 끝난 시각 */
function timeText(task: AppearanceHpTask) {
  if (task.status === 'PENDING' && task.nextAttemptAt)
    return ` · ${formatDateTime(task.nextAttemptAt)} 다음 시도`
  if (!task.completedAt) return ''
  if (task.status === 'DEAD')
    return ` · ${formatDateTime(task.completedAt)} 멈춤`
  if (task.status === 'DONE')
    return ` · ${formatDateTime(task.completedAt)} 완료`
  return ''
}

/** 결과는 훅이 안내하고 목록을 다시 불러온다. 진행 중에는 이 작업을 다시 보내지 못한다 */
function RetryButton({ taskId }: { taskId: number }) {
  const retry = useRetryAppearanceHpTask(taskId)
  const busy = useAppearanceHpTaskRetrying(taskId)
  return (
    <button
      type="button"
      className="btn sm primary"
      disabled={busy}
      aria-busy={busy}
      onClick={() => retry.mutate()}
    >
      {busy ? '다시 시도 중…' : '다시 시도'}
    </button>
  )
}
