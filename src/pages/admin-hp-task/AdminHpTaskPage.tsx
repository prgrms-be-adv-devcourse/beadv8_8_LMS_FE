import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { lectureHpTaskQuery } from '@/entities/hp-task/api'
import { hpTaskErrorLabel } from '@/entities/hp-task/errorCode'
import {
  HP_ATTEMPT_RESULT_LABEL,
  HP_TASK_OUTCOME_LABEL,
  HP_TASK_PURPOSE_LABEL,
  HP_TASK_TYPE_LABEL,
} from '@/entities/hp-task/labels'
import type {
  LectureHpTask,
  LectureHpTaskAttempt,
  LectureHpTaskDetail,
} from '@/entities/hp-task/types'
import { HpTaskStatusPill } from '@/entities/hp-task/ui/HpTaskStatusPill'
import {
  isFinalRetryError,
  useRetryHpTask,
  useRetryingHpTask,
} from '@/features/hp-task-admin/useRetryHpTask'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import {
  lookup,
  UNKNOWN_NAME,
  UNKNOWN_STATUS_NAME,
} from '@/shared/lib/statusLabel'
import { Modal } from '@/shared/ui/Modal'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AdminHpTaskPage.module.css'

const back = (
  <Link className="back" to="/admin/hp-tasks">
    ← 강의 HP 작업
  </Link>
)

export function AdminHpTaskPage() {
  const taskId = Number(useParams().taskId)
  const { data, error, isPending, refetch } = useQuery(
    lectureHpTaskQuery(taskId),
  )

  if (isPending)
    return (
      <div className="page">
        {back}
        <Loading />
      </div>
    )
  if (error)
    return (
      <div className="page">
        {back}
        <LoadError error={error} retry={refetch} />
      </div>
    )
  return <Detail key={taskId} detail={data} />
}

function Detail({
  detail: { task, attempts },
}: {
  detail: LectureHpTaskDetail
}) {
  return (
    <div className="page">
      {back}
      <PageHead
        title={`HP 작업 #${task.id}`}
        actions={
          <HpTaskStatusPill status={task.status} outcome={task.outcome} />
        }
      />
      <div className="split">
        <div className="page" style={{ gap: 16 }}>
          <section className="panel" aria-labelledby="hp-task-summary">
            <h2 id="hp-task-summary">작업</h2>
            <dl className="kv">
              <dt>유형</dt>
              <dd>
                {lookup(HP_TASK_TYPE_LABEL, task.taskType) ?? UNKNOWN_NAME} ·{' '}
                {lookup(HP_TASK_PURPOSE_LABEL, task.purpose) ?? UNKNOWN_NAME}
              </dd>
              <dt>금액</dt>
              <dd className="num">{formatNumber(task.amountHp)} HP</dd>
              <dt>주문</dt>
              <dd>
                주문 #{task.orderId} · 항목 #{task.orderItemId}
              </dd>
              <dt>구매자</dt>
              <dd>회원 #{task.payerUserId}</dd>
              {task.receiverUserId !== null && (
                <>
                  <dt>판매자</dt>
                  <dd>회원 #{task.receiverUserId}</dd>
                </>
              )}
              <dt>요청 ID</dt>
              <dd className={styles.code}>{task.requestId}</dd>
              <dt>만든 시각</dt>
              <dd>{formatDateTime(task.createdAt)}</dd>
              {task.completedAt && (
                <>
                  <dt>끝난 시각</dt>
                  <dd>{formatDateTime(task.completedAt)}</dd>
                </>
              )}
              {task.outcome && (
                <>
                  <dt>결과</dt>
                  <dd>
                    {lookup(HP_TASK_OUTCOME_LABEL, task.outcome) ??
                      UNKNOWN_STATUS_NAME}
                  </dd>
                </>
              )}
            </dl>
            <p className="fine">
              요청 ID는 지갑의 중복 방지 키예요. 재시도도 같은 요청 ID로 보내서
              HP가 두 번 움직이지 않아요.
            </p>
          </section>
          <ProcessingState task={task} />
          <Attempts task={task} attempts={attempts} />
        </div>
        {task.status === 'DEAD' && <Retry task={task} />}
      </div>
    </div>
  )
}

/** 시도 횟수·다음 시도·마지막 실패·관리자 재시도 기록 */
function ProcessingState({ task }: { task: LectureHpTask }) {
  return (
    <section className="panel" aria-labelledby="hp-task-state">
      <h2 id="hp-task-state">처리 상태</h2>
      <dl className="kv">
        <dt>시도</dt>
        <dd>
          누적 {task.totalAttemptCount}회 · 이번 자동 재시도 {task.attemptCount}
          회
        </dd>
        {task.status === 'PENDING' && (
          <>
            <dt>다음 시도</dt>
            <dd>{formatDateTime(task.nextAttemptAt)}</dd>
          </>
        )}
        {task.lastErrorCode && (
          <>
            <dt>마지막 실패</dt>
            <dd className={styles.code}>
              {task.lastFailedAt && `${formatDateTime(task.lastFailedAt)} · `}
              {hpTaskErrorLabel(task.lastErrorCode)}
            </dd>
          </>
        )}
        {task.manualRetryCount > 0 && (
          <>
            <dt>관리자 재시도</dt>
            <dd>
              {task.manualRetryCount}회
              {task.lastRetriedAt &&
                ` · 마지막 ${formatDateTime(task.lastRetriedAt)}`}
              {task.lastRetriedByUserId !== null &&
                ` · 관리자 #${task.lastRetriedByUserId}`}
            </dd>
          </>
        )}
      </dl>
      <p className="fine">
        자동 재시도 횟수는 관리자가 재시도하면 0부터 다시 세요. 누적 횟수와
        마지막 실패는 남아요.
      </p>
    </section>
  )
}

function Attempts({
  task,
  attempts,
}: {
  task: LectureHpTask
  attempts: LectureHpTaskAttempt[]
}) {
  // HP 작업으로 옮기기 전 지급 배치의 실패는 횟수만 옮겨 와 시도 이력이 없다.
  const missing = task.totalAttemptCount - attempts.length
  return (
    <section className="panel" aria-labelledby="hp-task-attempts">
      <h2 id="hp-task-attempts">시도 이력</h2>
      {attempts.length === 0 ? (
        <p className="fine">아직 시도한 기록이 없어요.</p>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl" aria-label="시도 이력">
            <thead>
              <tr>
                <th>회차</th>
                <th>결과</th>
                <th>오류</th>
                <th>진단 정보</th>
                <th>시작</th>
                <th>끝</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <AttemptRow key={attempt.attemptNo} attempt={attempt} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {missing > 0 && (
        <p className="fine">
          이력이 없는 {missing}회는 HP 작업으로 옮기기 전 지급 배치에서 실패한
          횟수예요.
        </p>
      )}
    </section>
  )
}

function AttemptRow({ attempt }: { attempt: LectureHpTaskAttempt }) {
  return (
    <tr aria-label={`${attempt.attemptNo}회차 시도`}>
      <td className="num">{attempt.attemptNo}</td>
      <td>
        {attempt.result
          ? (lookup(HP_ATTEMPT_RESULT_LABEL, attempt.result) ??
            UNKNOWN_STATUS_NAME)
          : '실행 중'}
      </td>
      <td className={styles.code}>
        {attempt.errorCode ?? '—'}
        {attempt.rawErrorCode && attempt.rawErrorCode !== attempt.errorCode && (
          <span className="fine"> (지갑 코드 {attempt.rawErrorCode})</span>
        )}
      </td>
      <td className={styles.detail}>{attempt.errorDetail ?? '—'}</td>
      <td>{formatDateTime(attempt.startedAt)}</td>
      <td>{attempt.completedAt ? formatDateTime(attempt.completedAt) : '—'}</td>
    </tr>
  )
}

/**
 * 멈춘 작업 재시도. 성공하면 작업이 대기로 바뀌어(상세를 다시 불러와) 이 영역과 모달이 사라진다.
 * 이미 재시도됐거나(409) 작업이 없으면(404) 모달을 닫는다.
 */
function Retry({ task }: { task: LectureHpTask }) {
  const [open, setOpen] = useState(false)
  const retry = useRetryHpTask(task.id)
  // 모달을 닫았다 열거나 화면을 다시 열어도, 진행 중인 재시도 요청이 있으면 다시 보내지 못한다.
  const busy = useRetryingHpTask(task.id)

  return (
    <section className="panel sticky" aria-labelledby="hp-task-retry">
      <h2 id="hp-task-retry">재시도</h2>
      <div className="notice bad">
        자동 처리가 멈췄어요. 마지막 실패와 시도 이력으로 원인을 확인하고 고친
        뒤 재시도하세요.
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => setOpen(true)}
        >
          재시도
        </button>
      </div>
      {open && (
        <Modal
          title="HP 작업을 재시도할까요?"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setOpen(false)}
              >
                닫기
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() =>
                  retry.mutate(undefined, {
                    onSuccess: () => setOpen(false),
                    onError: (e) => {
                      if (isFinalRetryError(e)) setOpen(false)
                    },
                  })
                }
              >
                재시도
              </button>
            </>
          }
        >
          <p>
            {lookup(HP_TASK_TYPE_LABEL, task.taskType) ?? UNKNOWN_NAME} ·{' '}
            {lookup(HP_TASK_PURPOSE_LABEL, task.purpose) ?? UNKNOWN_NAME} · 주문
            #{task.orderId} · 항목 #{task.orderItemId} (
            {formatNumber(task.amountHp)} HP)
          </p>
          <p>
            바로 보내지 않고 대기로 바꿔요. 다음 재시도 배치(1분마다)가 같은
            요청 ID로 다시 보내서 HP가 두 번 움직이지 않아요. 원인이 그대로면
            다시 멈춰요.
          </p>
          {task.lastErrorCode && (
            <p className={`fine ${styles.code}`}>
              마지막 실패: {hpTaskErrorLabel(task.lastErrorCode)}
            </p>
          )}
        </Modal>
      )}
    </section>
  )
}
