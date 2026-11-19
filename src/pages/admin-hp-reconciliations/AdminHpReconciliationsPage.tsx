import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import {
  latestHpReconciliationQuery,
  RECONCILIATION_POLL_MS,
} from '@/entities/hp-reconciliation/api'
import {
  appearanceReferenceTypeName,
  RECONCILIATION_APPS,
  reconciliationItemStatusName,
  reconciliationRuleName,
  reconciliationTriggerName,
} from '@/entities/hp-reconciliation/labels'
import type {
  AppearanceMismatch,
  LectureMismatch,
  ReconciliationApp,
  ReconciliationRun,
} from '@/entities/hp-reconciliation/types'
import { ReconciliationStatusPill } from '@/entities/hp-reconciliation/ui/ReconciliationStatusPill'
import {
  useHpReconciliationRunBusy,
  useRunHpReconciliation,
} from '@/features/hp-reconciliation-admin/useRunHpReconciliation'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { useMergedSearchParams } from '@/shared/lib/useMergedSearchParams'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { InlineLoadError, LoadError, Loading } from '@/shared/ui/QueryState'
import { Tabs } from '@/shared/ui/Tabs'
import styles from './AdminHpReconciliationsPage.module.css'
import admin from '@/pages/admin-shared.module.css'

const TABS: { value: ReconciliationApp; label: string }[] = [
  { value: 'lecture', label: RECONCILIATION_APPS.lecture.label },
  { value: 'appearance', label: RECONCILIATION_APPS.appearance.label },
]

/** 앱은 URL에 둔다(?app=appearance). 없거나 모르는 값은 강의다 */
export function AdminHpReconciliationsPage() {
  const [params, merge] = useMergedSearchParams()
  const app: ReconciliationApp =
    params.get('app') === 'appearance' ? 'appearance' : 'lecture'

  return (
    <div className="page">
      <PageHead
        title="HP 대사"
        lede="강의·출연 앱이 매일 자기 상태와 지갑의 보류·지급 기록을 비교해요. 어긋난 건은 고치지 않고 남기기만 하니 원인을 확인하세요. 지금 실행은 비교만 하고 HP를 옮기지 않아요."
      />
      <Tabs
        label="대사할 앱"
        items={TABS}
        value={app}
        onChange={(next) =>
          merge(
            () =>
              new URLSearchParams(
                next === 'appearance' ? { app: 'appearance' } : {},
              ),
          )
        }
      >
        {app === 'lecture' ? (
          <LectureReconciliation key="lecture" />
        ) : (
          <AppearanceReconciliation key="appearance" />
        )}
      </Tabs>
    </div>
  )
}

/** 실행 중이거나 지금 실행 요청이 끝나지 않았으면 마지막 결과를 다시 읽는다 */
function useLatest<A extends ReconciliationApp>(app: A) {
  const busy = useHpReconciliationRunBusy(app)
  return useQuery({
    ...latestHpReconciliationQuery(app),
    refetchInterval: (query) =>
      busy || query.state.data?.status === 'RUNNING'
        ? RECONCILIATION_POLL_MS
        : false,
  })
}

function LectureReconciliation() {
  return (
    <Reconciliation
      app="lecture"
      query={useLatest('lecture')}
      table={(rows) => <LectureTable rows={rows} />}
    />
  )
}

function AppearanceReconciliation() {
  return (
    <Reconciliation
      app="appearance"
      query={useLatest('appearance')}
      table={(rows) => <AppearanceTable rows={rows} />}
    />
  )
}

/** 한 앱의 마지막 결과와 지금 실행. 어긋난 건과 멈춘 작업 표시(HP_TASK_DEAD)는 표를 나눈다 */
function Reconciliation<M extends { id: number; rule: string }>({
  app,
  query: { data, error, isPending, refetch },
  table,
}: {
  app: ReconciliationApp
  query: UseQueryResult<ReconciliationRun<M> | null>
  table: (rows: M[]) => ReactNode
}) {
  const busy = useHpReconciliationRunBusy(app)
  const run = useRunHpReconciliation(app)
  const running = data?.status === 'RUNNING'

  return (
    <>
      <div className={`toolbar ${admin.toolbar}`}>
        <span className="fine">
          {running
            ? '실행이 끝나면 지금 실행할 수 있어요.'
            : '비교만 하고 HP는 옮기지 않아요. 처음 실행은 오래 걸릴 수 있어요.'}
        </span>
        <button
          type="button"
          className="btn primary"
          disabled={busy || running}
          onClick={() => run.mutate()}
        >
          {busy && <span className="spinner sm" aria-hidden="true" />}
          {busy ? '실행 중…' : '지금 실행'}
        </button>
      </div>
      {isPending ? (
        <Loading />
      ) : data === undefined ? (
        error && <LoadError error={error} retry={refetch} />
      ) : data === null ? (
        <EmptyState title="아직 실행한 적이 없어요">
          매일 배치가 돌거나 지금 실행하면 마지막 결과가 여기에 보여요.
        </EmptyState>
      ) : (
        <>
          {/* 실행 중에 다시 읽기가 실패해도 보던 결과는 남긴다 */}
          {error && (
            <InlineLoadError
              title="마지막 결과를 다시 불러오지 못했어요."
              error={error}
              retry={refetch}
            />
          )}
          <Summary app={app} run={data} />
          {!running && (
            <Mismatches
              rows={data.mismatches}
              incomplete={data.status === 'INCOMPLETE'}
              hpTasks={RECONCILIATION_APPS[app].hpTasks}
              table={table}
            />
          )}
        </>
      )}
    </>
  )
}

function Summary({
  app,
  run,
}: {
  app: ReconciliationApp
  run: ReconciliationRun<unknown>
}) {
  return (
    <section className="panel" aria-labelledby="hp-reconciliation-summary">
      <div className="panel-head">
        <h2 id="hp-reconciliation-summary">마지막 결과</h2>
        <ReconciliationStatusPill status={run.status} />
      </div>
      <dl className={`kv ${admin.kv}`}>
        <dt>계기</dt>
        <dd>
          {reconciliationTriggerName(run.triggerType)}
          {run.triggeredBy !== null && ` · 관리자 #${run.triggeredBy}`}
        </dd>
        <dt>시작</dt>
        <dd>{formatDateTime(run.startedAt)}</dd>
        <dt>끝</dt>
        <dd>{run.finishedAt ? formatDateTime(run.finishedAt) : '—'}</dd>
      </dl>
      {run.status === 'RUNNING' ? (
        <div className="notice" role="status">
          실행 중이에요. 끝나면 건수와 어긋난 건이 보여요(5초마다 다시
          확인해요).
        </div>
      ) : (
        <div className="summary" aria-label="건수">
          <Count label={RECONCILIATION_APPS[app].checked}>
            {run.checkedCount}
          </Count>
          <Count label="어긋난 건" tone={run.mismatchCount > 0 ? 'bad' : ''}>
            {run.mismatchCount}
          </Count>
          <Count label="멈춘 작업 있음" tone={run.deadCount > 0 ? 'hold' : ''}>
            {run.deadCount}
          </Count>
        </div>
      )}
      {run.status === 'INCOMPLETE' && (
        <div className="notice warn">
          끝까지 비교하지 못했어요. 다음 실행이 같은 범위를 다시 봐요.
          {run.failureReason && (
            <span className={styles.reason}>
              실패 이유: {run.failureReason}
            </span>
          )}
        </div>
      )}
    </section>
  )
}

function Count({
  label,
  tone = '',
  children,
}: {
  label: string
  tone?: '' | 'bad' | 'hold'
  children: number
}) {
  return (
    <div
      className={`sum ${styles.count}`}
      data-tone={children > 0 ? tone : ''}
      role="group"
      aria-label={label}
    >
      <span>{label}</span>
      <b className={tone && `c-${tone}`}>{formatNumber(children)}건</b>
    </div>
  )
}

function Mismatches<M extends { rule: string }>({
  rows,
  incomplete,
  hpTasks,
  table,
}: {
  rows: M[]
  /** 끝까지 비교하지 못한 실행(INCOMPLETE). 찾은 건이 없어도 '없다'고 말하지 않는다 */
  incomplete: boolean
  hpTasks: { to: string; label: string }
  table: (rows: M[]) => ReactNode
}) {
  const dead = rows.filter((m) => m.rule === 'HP_TASK_DEAD')
  const mismatches = rows.filter((m) => m.rule !== 'HP_TASK_DEAD')
  return (
    <>
      <section
        className={
          mismatches.length > 0 ? `panel ${admin.dangerZone}` : 'panel'
        }
        aria-labelledby="hp-reconciliation-mismatches"
      >
        <h2 id="hp-reconciliation-mismatches">어긋난 건</h2>
        {mismatches.length === 0 ? (
          <p className="fine">
            {incomplete
              ? '끝까지 비교하지 못해 어긋난 건을 다 확인하지 못했어요. 다음 실행이 같은 범위를 다시 봐요.'
              : '어긋난 건이 없어요.'}
          </p>
        ) : (
          <>
            <p className="fine">
              조치 API가 없어요. 상태 요약으로 원인을 확인하세요.
            </p>
            {table(mismatches)}
          </>
        )}
      </section>
      {dead.length > 0 && (
        <section className="panel" aria-labelledby="hp-reconciliation-dead">
          <div className="panel-head">
            <h2 id="hp-reconciliation-dead">멈춘 작업 있음</h2>
            <Link className="btn sm" to={hpTasks.to}>
              {hpTasks.label}에서 보기
            </Link>
          </div>
          <p className="fine">
            자동 처리가 멈춘 HP 작업이 있어 비교하지 않았어요. HP 작업을
            재시도해 끝내면 다음 실행에서 비교해요.
          </p>
          {table(dead)}
        </section>
      )}
    </>
  )
}

function RuleCell({ rule }: { rule: string }) {
  return (
    <td>
      <span className={`pill ${rule === 'HP_TASK_DEAD' ? 'warn' : 'bad'}`}>
        {reconciliationRuleName(rule)}
      </span>
      <span className={`fine ${styles.code}`}>{rule}</span>
    </td>
  )
}

function LectureTable({ rows }: { rows: LectureMismatch[] }) {
  return (
    <div className={`tbl-wrap ${admin.tableWrap}`}>
      <table
        className={`tbl ${styles.compare}`}
        aria-label="강의 대조 불일치 항목"
      >
        <thead>
          <tr>
            <th scope="col">규칙</th>
            <th scope="col">주문 항목</th>
            <th scope="col">항목 상태</th>
            <th scope="col">강의 쪽</th>
            <th scope="col">지갑 쪽</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} aria-label={`주문 항목 #${m.orderItemId}`}>
              <RuleCell rule={m.rule} />
              <td className={styles.nowrap}>
                항목 #{m.orderItemId}
                <span className="fine">
                  {m.orderId === null ? '강의에 없음' : `주문 #${m.orderId}`}
                </span>
              </td>
              <td className={styles.nowrap}>
                {m.itemStatus === null
                  ? '—'
                  : reconciliationItemStatusName(m.itemStatus)}
              </td>
              <td className={styles.state}>{m.lectureState}</td>
              <td className={styles.state}>{m.walletState}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AppearanceTable({ rows }: { rows: AppearanceMismatch[] }) {
  return (
    <div className={`tbl-wrap ${admin.tableWrap}`}>
      <table
        className={`tbl ${styles.compare}`}
        aria-label="출연 대조 불일치 항목"
      >
        <thead>
          <tr>
            <th scope="col">규칙</th>
            <th scope="col">대상</th>
            <th scope="col">출연 쪽</th>
            <th scope="col">지갑 쪽</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const target = `${appearanceReferenceTypeName(m.referenceType)} #${m.referenceId}`
            return (
              <tr key={m.id} aria-label={target}>
                <RuleCell rule={m.rule} />
                <td className={styles.nowrap}>
                  {target}
                  {m.appearanceId !== null && (
                    <span className="fine">출연 #{m.appearanceId}</span>
                  )}
                </td>
                <td className={styles.state}>{m.appearanceState}</td>
                <td className={styles.state}>{m.walletState}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
