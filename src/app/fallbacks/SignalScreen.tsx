import type { ReactNode } from 'react'
import styles from './SignalScreen.module.css'

type Tone = 'nosignal' | 'error' | 'standby'

type SignalScreenProps = {
  /** 모니터 위 큰 글자(404) 또는 머리표(STAND BY 등) */
  code: string
  /** 숫자 코드면 크게 보인다 */
  bigCode?: boolean
  /** 모니터 화면에 겹쳐 보이는 글자(장식) */
  screenLabel: string
  tone?: Tone
  title: string
  /** 화면에 이미 h1이 있으면(준비 중 화면) h2로 내린다 */
  headingLevel?: 1 | 2
  children: ReactNode
  actions?: ReactNode
}

const BARS = ['gray', 'yellow', 'cyan', 'green', 'magenta', 'red', 'blue']
const SUB_BARS = ['blue', 'black', 'magenta', 'black', 'cyan', 'black', 'gray']
const PLUGE = ['navy', 'white', 'violet', 'black', 'black']

/**
 * 없는 화면·오류·준비 중 화면. 방송이 끊겼을 때의 컬러바 화면을 빌려 "여기서는 볼 것이 없다"를 보인다.
 * 모니터 그림은 장식이라 글자를 넣지 않는다(문구는 아래 제목·설명에만 있다).
 */
export function SignalScreen({
  code,
  bigCode = false,
  screenLabel,
  tone = 'nosignal',
  title,
  headingLevel = 1,
  children,
  actions,
}: SignalScreenProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <div className={styles.screen} data-tone={tone}>
      <div className={styles.monitor} aria-hidden="true">
        <div className={styles.glass} data-label={screenLabel}>
          <div className={styles.bars}>
            {BARS.map((c, i) => (
              <span key={i} data-c={c} />
            ))}
          </div>
          <div className={styles.subBars}>
            {SUB_BARS.map((c, i) => (
              <span key={i} data-c={c} />
            ))}
          </div>
          <div className={styles.pluge}>
            {PLUGE.map((c, i) => (
              <span key={i} data-c={c} />
            ))}
          </div>
          <span className={styles.scan} />
        </div>
        <span className={styles.tally} />
      </div>
      <p className={bigCode ? styles.bigCode : styles.code}>{code}</p>
      <Heading className={styles.title}>{title}</Heading>
      <p className={styles.desc}>{children}</p>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  )
}
