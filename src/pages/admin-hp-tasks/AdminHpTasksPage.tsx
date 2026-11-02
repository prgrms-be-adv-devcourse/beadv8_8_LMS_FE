import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { lectureHpTasksQuery } from '@/entities/hp-task/api'
import { hpTaskErrorLabel } from '@/entities/hp-task/errorCode'
import {
  HP_TASK_PURPOSE_LABEL,
  HP_TASK_STATUS_FILTERS,
  HP_TASK_TYPE_LABEL,
  type HpTaskStatusFilter,
} from '@/entities/hp-task/labels'
import type { HpTaskType, LectureHpTask } from '@/entities/hp-task/types'
import { HpTaskStatusPill } from '@/entities/hp-task/ui/HpTaskStatusPill'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AdminHpTasksPage.module.css'

const TASK_TYPES = Object.keys(HP_TASK_TYPE_LABEL) as HpTaskType[]

/**
 * 상태·유형은 URL에 둔다(?status=&taskType=). 기본은 멈춘 작업 · 모든 유형이고, 바꾸면 첫 페이지로 간다.
 * 없거나 모르는 값은 기본값으로 본다. 페이지는 usePageParam이 맡는다.
 */
function useListParams() {
  const [params, setParams] = useSearchParams()
  const status: HpTaskStatusFilter =
    HP_TASK_STATUS_FILTERS.find((f) => f.status === params.get('status'))
      ?.status ?? 'DEAD'
  const taskType = TASK_TYPES.find((t) => t === params.get('taskType'))

  const update = (
    next: Partial<{
      status: HpTaskStatusFilter
      taskType: HpTaskType | undefined
    }>,
  ) => {
    const merged = { status, taskType, ...next }
    const search = new URLSearchParams()
    if (merged.status !== 'DEAD') search.set('status', merged.status)
    if (merged.taskType) search.set('taskType', merged.taskType)
    setParams(search)
  }
  return { status, taskType, update }
}

export function AdminHpTasksPage() {
  const { status, taskType, update } = useListParams()
  const [page, setPage] = usePageParam('page')
  const query = useQuery(
    lectureHpTasksQuery({
      status: status === 'ALL' ? undefined : status,
      taskType,
      page,
    }),
  )
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, refetch } = query
  const filter =
    HP_TASK_STATUS_FILTERS.find((f) => f.status === status) ??
    HP_TASK_STATUS_FILTERS[0]

  return (
    <div className="page">
      <PageHead
        title="강의 HP 작업"
        lede="강의 주문의 HP 보류·반환·지급 요청이에요. 실패하면 자동으로 다시 시도하고, 정해진 횟수를 넘기거나 다시 보내도 안 되는 오류면 멈춰요. 멈춘 작업은 원인을 고친 뒤 상세에서 재시도해요."
      />
      <div className="toolbar">
        <div role="group" aria-label="작업 상태" className={styles.filters}>
          {HP_TASK_STATUS_FILTERS.map((f) => (
            <button
              key={f.status}
              type="button"
              className={status === f.status ? 'btn sm primary' : 'btn sm'}
              aria-pressed={status === f.status}
              onClick={() => update({ status: f.status })}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          className="select sm"
          value={taskType ?? ''}
          onChange={(e) =>
            update({
              taskType: TASK_TYPES.find((t) => t === e.target.value),
            })
          }
          aria-label="작업 유형"
        >
          <option value="">모든 유형</option>
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {HP_TASK_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState title={filter.empty} />
      ) : (
        <section className="panel">
          <ul className={styles.list} aria-label="HP 작업 목록">
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

function TaskItem({ task }: { task: LectureHpTask }) {
  return (
    <li className="q-item" aria-label={`HP 작업 #${task.id}`}>
      <div className="row-main">
        <div className={styles.head}>
          <HpTaskStatusPill status={task.status} outcome={task.outcome} />
          <b>
            #{task.id} {HP_TASK_TYPE_LABEL[task.taskType]} ·{' '}
            {HP_TASK_PURPOSE_LABEL[task.purpose]}
          </b>
        </div>
        <span className="fine">
          주문 #{task.orderId} · 항목 #{task.orderItemId} · 구매자 회원 #
          {task.payerUserId}
          {task.receiverUserId !== null &&
            ` · 판매자 회원 #${task.receiverUserId}`}{' '}
          · {formatNumber(task.amountHp)} HP
        </span>
        {task.lastErrorCode && (
          <span className={`fine ${styles.code}`}>
            시도 {task.totalAttemptCount}회 · 마지막 실패{' '}
            {task.lastFailedAt && formatDateTime(task.lastFailedAt)} ·{' '}
            {hpTaskErrorLabel(task.lastErrorCode)}
          </span>
        )}
        {task.status === 'PENDING' && (
          <span className="fine">
            {formatDateTime(task.nextAttemptAt)} 다음 시도
          </span>
        )}
        {task.manualRetryCount > 0 && (
          <span className="fine">관리자 재시도 {task.manualRetryCount}회</span>
        )}
      </div>
      <div className="row-actions">
        <Link className="btn sm" to={`/admin/hp-tasks/${task.id}`}>
          상세
        </Link>
      </div>
    </li>
  )
}
