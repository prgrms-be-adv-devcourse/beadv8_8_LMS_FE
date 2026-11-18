import styles from './RoleJourney.module.css'

/** 회원 단계와 각 단계에서 쓸 수 있는 것(채널 인증·승급 신청 화면의 안내 문구 범위) */
const STAGES = [
  ['유저', '강의를 사고 들어요.'],
  ['인플루언서', '출연 요청·지원, 채팅, 환전을 쓸 수 있어요.'],
  ['인증된 인플루언서', '강의를 등록하고 판매할 수 있어요.'],
] as const

type RoleJourneyProps = {
  /** 지금 단계(0 유저, 1 인플루언서, 2 인증된 인플루언서) */
  current: number
  /** 이 화면에서 오르는 단계. 강조해 다음 목표를 보인다 */
  target: number
}

/**
 * 유저 → 인플루언서 → 인증된 인플루언서 스테퍼. 지난 단계는 체크, 지금 단계는 `aria-current`, 이 화면에서 오를 단계는 신호색 테두리.
 */
export function RoleJourney({ current, target }: RoleJourneyProps) {
  return (
    <ol className={styles.journey} aria-label="회원 단계">
      {STAGES.map(([name, gain], i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'next'
        const className = [
          styles.stage,
          styles[state],
          i === target && i > current ? styles.target : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <li
            key={name}
            className={className}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className={styles.marker} aria-hidden="true">
              {state === 'done' ? (
                <svg viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3.5 8.4 6.6 11.4 12.5 4.8"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span className={styles.text}>
              <span className={styles.step} aria-hidden="true">
                {state === 'current'
                  ? 'NOW'
                  : i === target && i > current
                    ? 'NEXT'
                    : `STEP ${i + 1}`}
              </span>
              <b className={styles.name}>{name}</b>
              <span className={styles.gain}>{gain}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
