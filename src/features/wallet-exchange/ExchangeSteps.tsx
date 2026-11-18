import type { ExchangeStatus } from '@/entities/wallet/types'
import styles from './ExchangeSteps.module.css'

const STEPS = [
  ['신청', '수익 HP를 보류해요'],
  ['관리자 승인', '승인 전에는 취소할 수 있어요'],
  ['송금', '정산 예정일에 계좌로 보내요'],
] as const

/**
 * 지금 진행 중인 단계(0부터). 모두 끝났으면 STEPS.length, 흐름에서 벗어났으면(거절·취소·최종 실패·모르는 상태) null.
 * 화면 안내용이고 상태 판단은 BE 값(배지)이 기준이다.
 */
function exchangeStep(status: ExchangeStatus): number | null {
  switch (status) {
    case 'REQUESTED':
      return 1
    case 'APPROVED':
    case 'PROCESSING':
    case 'FAILED':
    case 'UNKNOWN':
      return 2
    case 'COMPLETED':
      return STEPS.length
    default:
      return null
  }
}

/** 환전 흐름(신청 → 관리자 승인 → 송금)과 지금 위치 */
export function ExchangeSteps({ current }: { current: number }) {
  return (
    <ol className={styles.steps} aria-label="환전 진행 단계">
      {STEPS.map(([title, text], i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'todo'
        return (
          <li
            key={title}
            className={`${styles.step} ${styles[state]}`}
            aria-current={state === 'now' ? 'step' : undefined}
          >
            <span className={styles.mark} aria-hidden="true">
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span className={styles.body}>
              <b>{title}</b>
              <span className={styles.text}>{text}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** 서버가 준 상태의 진행 위치. 흐름에서 벗어난 상태(거절·취소 등)는 배지만 보이고 단계는 숨긴다. */
export function ExchangeProgress({ status }: { status: ExchangeStatus }) {
  const step = exchangeStep(status)
  return step === null ? null : <ExchangeSteps current={step} />
}
