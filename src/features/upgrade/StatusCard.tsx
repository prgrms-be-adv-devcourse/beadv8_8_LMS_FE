import type { ReactNode } from 'react'
import styles from './StatusCard.module.css'

type Tone = 'ok' | 'warn' | 'bad' | 'info'

type StatusCardProps = {
  tone: Tone
  /** 상태 필 등 카드 머리(없으면 본문만) */
  title?: ReactNode
  children: ReactNode
  role?: 'status' | 'alert'
}

const ICON: Record<Tone, ReactNode> = {
  ok: <path d="M5 10.4 8.4 13.6 15 6.6" />,
  warn: (
    <>
      <circle cx="10" cy="10" r="6.2" />
      <path d="M10 6.8V10l2.2 1.6" />
    </>
  ),
  bad: <path d="M6.5 6.5 13.5 13.5M13.5 6.5 6.5 13.5" />,
  info: <path d="M10 9v5M10 6.2v.1" />,
}

/** 심사 대기·반려·완료 같은 단계 결과를 아이콘과 색 띠로 분명히 보이는 카드 */
export function StatusCard({ tone, title, children, role }: StatusCardProps) {
  return (
    <div className={`${styles.card} ${styles[tone]}`} role={role}>
      <span className={styles.icon} aria-hidden="true">
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {ICON[tone]}
        </svg>
      </span>
      <div className={styles.body}>
        {title && <div className={styles.title}>{title}</div>}
        {children}
      </div>
    </div>
  )
}
