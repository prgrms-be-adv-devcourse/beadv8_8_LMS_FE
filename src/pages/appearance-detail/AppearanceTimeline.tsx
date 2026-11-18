import {
  CONFIRM_PERIOD_DAYS,
  confirmDeadline,
  confirmStage,
} from '@/entities/appearance/rules'
import type { Appearance, HpReleaseStatus } from '@/entities/appearance/types'
import { formatDateTime, formatDday } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import styles from './AppearanceTimeline.module.css'

type StepState = 'done' | 'current' | 'upcoming' | 'stopped'

type Step = {
  key: string
  label: string
  /** 그 단계의 시각(BE 값)이나 기한 */
  when?: string
  /** 기한까지 남은 날(D-n) */
  dday?: string
  note?: string
  state: StepState
  /** 이 단계 동안 출연료가 보류돼 있다 */
  hold?: boolean
  /** 정산이 끝난 단계(지급) */
  paid?: boolean
}

const STATE_TEXT: Record<StepState, string> = {
  done: '완료',
  current: '지금 단계',
  upcoming: '예정',
  stopped: '종료',
}

/** 지급 처리 상태별 단계 표시. 모르는 값이면 설명 없이 지금 단계로만 둔다 */
function payoutStep(status: HpReleaseStatus | null): Step {
  switch (status) {
    case 'DONE':
      return { key: 'pay', label: '출연료 지급', state: 'done', paid: true }
    case 'DEAD':
      return {
        key: 'pay',
        label: '출연료 지급',
        note: '처리 지연 · 고객센터 확인',
        state: 'stopped',
      }
    case 'PENDING':
    case null:
      return {
        key: 'pay',
        label: '출연료 지급',
        note: '지급 처리 중',
        state: 'current',
      }
    default:
      return { key: 'pay', label: '출연료 지급', state: 'current' }
  }
}

/**
 * 출연 진행 단계: 성립 → 방송 → 확인 기간 → 출연료 지급. 취소·불참으로 끝난 출연은 끝난 단계에서 멈춘다.
 * 상태·시각은 BE 값을 그대로 쓰고, 확인 기한은 상태 안내와 같은 규칙(confirmDeadline)으로 보인다.
 * 모르는 상태면 단계를 그리지 않는다.
 */
function stepsOf(appearance: Appearance): Step[] | null {
  const established: Step = {
    key: 'established',
    label: '성립',
    when: formatDateTime(appearance.establishedAt),
    state: 'done',
  }
  const air = (state: StepState, extra?: Partial<Step>): Step => ({
    key: 'air',
    label: '방송',
    when: formatDateTime(appearance.scheduledAt),
    state,
    ...extra,
  })
  const deadline = confirmDeadline(appearance.scheduledAt)
  const confirmUpcoming: Step = {
    key: 'confirm',
    label: '확인 기간',
    note: `방송 뒤 ${CONFIRM_PERIOD_DAYS}일 안에 호스트가 확인`,
    state: 'upcoming',
  }
  const payUpcoming: Step = {
    key: 'pay',
    label: '출연료 지급',
    state: 'upcoming',
  }

  switch (appearance.status) {
    case 'ESTABLISHED': {
      const stage = confirmStage(appearance)
      if (stage === 'before')
        return [
          established,
          air('current', { hold: true }),
          confirmUpcoming,
          payUpcoming,
        ]
      return [
        established,
        air('done'),
        {
          key: 'confirm',
          label: '확인 기간',
          when: `${formatDateTime(deadline)}까지`,
          dday: stage === 'open' ? formatDday(deadline) : undefined,
          note: stage === 'ended' ? '기한이 지나 자동 확인 대기' : undefined,
          state: 'current',
          hold: true,
        },
        payUpcoming,
      ]
    }
    case 'CANCEL_REQUESTED':
      return [
        established,
        air('current', { note: '게스트의 취소 요청 검토 중', hold: true }),
        confirmUpcoming,
        payUpcoming,
      ]
    case 'CONFIRMED':
      return [
        established,
        air('done'),
        {
          key: 'confirm',
          label: '확인 기간',
          when: appearance.confirmedAt
            ? formatDateTime(appearance.confirmedAt)
            : undefined,
          note:
            appearance.confirmType === 'AUTO'
              ? '기한이 지나 자동으로 확인됨'
              : '호스트가 확인함',
          state: 'done',
        },
        payoutStep(appearance.hpPayoutStatus),
      ]
    case 'ABSENT':
      return [
        established,
        air('done'),
        {
          key: 'end',
          label: '불참',
          when: appearance.absentAt
            ? formatDateTime(appearance.absentAt)
            : undefined,
          note: '출연료는 호스트에게 돌아감',
          state: 'stopped',
        },
      ]
    case 'CANCELED_BY_HOST':
      return [
        established,
        {
          key: 'end',
          label: '호스트 일방 취소',
          when: appearance.canceledAt
            ? formatDateTime(appearance.canceledAt)
            : undefined,
          note: '방송 전 취소 · 위약금은 게스트에게',
          state: 'stopped',
        },
      ]
    case 'CANCELED_BY_AGREEMENT':
      return [
        established,
        {
          key: 'end',
          label: '합의로 취소',
          when: appearance.canceledAt
            ? formatDateTime(appearance.canceledAt)
            : undefined,
          note: '위약금 없이 출연료는 호스트에게 돌아감',
          state: 'stopped',
        },
      ]
    default:
      return null
  }
}

/** 출연 상세의 세로 진행 단계. 지금 단계는 신호색, 지난 단계는 체크, 보류 중인 출연료는 호박색 */
export function AppearanceTimeline({ appearance }: { appearance: Appearance }) {
  const steps = stepsOf(appearance)
  if (!steps) return null
  return (
    <section className="panel" aria-labelledby="appearance-progress-title">
      <h2 id="appearance-progress-title">진행 상황</h2>
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li
            key={step.key}
            className={`${styles.step} ${styles[step.state]}`}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            <span className={styles.marker} aria-hidden="true">
              {step.state === 'done'
                ? '✓'
                : step.state === 'stopped'
                  ? '■'
                  : ''}
            </span>
            <div className={styles.text}>
              <div className={styles.line}>
                <b className={styles.label}>{step.label}</b>
                <span className="sr-only">({STATE_TEXT[step.state]})</span>
                {step.dday && <span className={styles.dday}>{step.dday}</span>}
              </div>
              {step.when && <span className={styles.when}>{step.when}</span>}
              {step.note && <span className={styles.note}>{step.note}</span>}
              {step.hold && (
                <span className={styles.hold}>
                  {formatNumber(appearance.fee)} HP 보류 중
                </span>
              )}
              {step.paid && (
                <span className={styles.paid}>
                  {formatNumber(appearance.fee)} HP 지급 완료
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
