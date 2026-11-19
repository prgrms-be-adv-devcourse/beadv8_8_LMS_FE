import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { appearanceHpTasksQuery } from '@/entities/appearance-hp-task/api'
import {
  APPEARANCE_HP_TASK_STATUS_FILTERS,
  appearanceHpTaskReasonName,
  appearanceHpTaskRefName,
  appearanceHpTaskTypeName,
} from '@/entities/appearance-hp-task/labels'
import type { AppearanceHpTask } from '@/entities/appearance-hp-task/types'
import { AppearanceHpTaskStatusPill } from '@/entities/appearance-hp-task/ui/AppearanceHpTaskStatusPill'
import { FilterCount } from '@/features/admin-flow/FilterCount'
import { knownCounts } from '@/features/admin-flow/knownCounts'
import {
  appearanceRetryFailureMessage,
  isFinalAppearanceRetryError,
  useAppearanceHpTaskRetrying,
  useRetryAppearanceHpTask,
} from '@/features/appearance-hp-task-admin/useRetryAppearanceHpTask'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useMergedSearchParams } from '@/shared/lib/useMergedSearchParams'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Modal } from '@/shared/ui/Modal'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AdminAppearanceHpTasksPage.module.css'
import admin from '@/pages/admin-shared.module.css'

type StatusFilter = (typeof APPEARANCE_HP_TASK_STATUS_FILTERS)[number]

/**
 * 상태는 URL에 둔다(?status=). 기본은 멈춤이고, 바꾸면 첫 페이지로 간다. 없거나 모르는 값은 멈춤으로 본다.
 * 페이지는 usePageParam이 맡는다.
 */
function useStatusParam() {
  const [params, merge] = useMergedSearchParams()
  const filter: StatusFilter =
    APPEARANCE_HP_TASK_STATUS_FILTERS.find(
      (f) => f.status === params.get('status'),
    ) ?? APPEARANCE_HP_TASK_STATUS_FILTERS[0]
  const update = (next: StatusFilter['status']) => {
    const search = new URLSearchParams()
    if (next !== 'DEAD') search.set('status', next)
    merge(() => search)
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
  const counts = knownCounts({
    filter: filter.status,
    total: data?.page.totalElements,
    isPlaceholderData: query.isPlaceholderData,
  })

  return (
    <div className="page">
      <PageHead
        title="출연 HP 작업"
        lede="출연 요청서·모집글·출연의 보류 HP 반환·위약금 정산·지급 요청이에요. 실패하면 자동으로 다시 시도하고, 지갑이 거절하거나 재시도를 다 써도 실패하면 자동 처리가 멈춰요. 멈춘 작업은 원인을 고친 뒤 다시 시도하면 같은 요청 ID로 바로 한 번 보내요."
      />
      <div className={`toolbar ${admin.toolbar}`}>
        <div
          role="group"
          aria-label="작업 상태"
          className={`${styles.filters} ${admin.seg}`}
        >
          {APPEARANCE_HP_TASK_STATUS_FILTERS.map((f) => (
            <button
              key={f.status}
              type="button"
              className="btn sm"
              aria-pressed={filter.status === f.status}
              onClick={() => update(f.status)}
            >
              {f.label}
              <FilterCount count={counts[f.status]} />
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
        <section className={`panel ${admin.queue}`}>
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
        <span className={`fine ${admin.mono}`}>
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
          <RetryButton task={task} />
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

/** 확인 창을 거쳐 다시 시도한다. 진행 중에는 이 작업을 다시 보내지 못한다 */
function RetryButton({ task }: { task: AppearanceHpTask }) {
  const [open, setOpen] = useState(false)
  const busy = useAppearanceHpTaskRetrying(task.id)
  return (
    <>
      <button
        type="button"
        className="btn sm primary"
        disabled={busy}
        aria-busy={busy}
        onClick={() => setOpen(true)}
      >
        {busy ? '다시 시도 중…' : '다시 시도'}
      </button>
      {open && <RetryModal task={task} onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * 다시 시도 확인. 바로 처리되거나(DONE) 결과를 모르면(PENDING) 훅이 안내하고 창을 닫는다.
 * 지갑이 다시 거절했거나(DEAD) 요청이 실패하면 창 안에 남기고 다시 시도하게 한다.
 */
function RetryModal({
  task,
  onClose,
}: {
  task: AppearanceHpTask
  onClose: () => void
}) {
  const retry = useRetryAppearanceHpTask(task.id)
  const busy = useAppearanceHpTaskRetrying(task.id)
  const failure = appearanceRetryFailureMessage(retry.data, retry.error)
  return (
    <Modal
      title="출연 HP 작업을 다시 시도할까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() =>
              retry.mutate(undefined, {
                onSuccess: (result) => {
                  if (result.status !== 'DEAD') onClose()
                },
                onError: (e) => {
                  if (isFinalAppearanceRetryError(e)) onClose()
                },
              })
            }
          >
            다시 시도
          </button>
        </>
      }
    >
      <p>
        #{task.id} {appearanceHpTaskTypeName(task.taskType)} ·{' '}
        {appearanceHpTaskReasonName(task.reason)} ({amountText(task)})
      </p>
      <p>
        같은 요청 ID로 지갑에 바로 한 번 보내요. 이미 처리된 요청이면 지갑이
        중복을 막아 HP가 두 번 움직이지 않아요. 원인이 그대로면 다시 멈춰요.
      </p>
      {task.lastError && (
        <p className={`fine ${styles.code}`}>마지막 오류: {task.lastError}</p>
      )}
      {failure && (
        <div className="notice bad" role="alert">
          {failure}
        </div>
      )}
    </Modal>
  )
}
