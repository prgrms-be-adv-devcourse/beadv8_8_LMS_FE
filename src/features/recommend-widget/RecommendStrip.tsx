import type { ReactNode } from 'react'
import styles from './RecommendStrip.module.css'

/**
 * 목록 화면 위쪽의 추천 띠. 작은 머리글과 제목, 그 아래 카드(또는 추천하지 못한 까닭)를 늘 펼쳐 둔다.
 * note는 제목 옆에 붙는 짧은 안내다(맞춤 재료가 없을 때 등). 강의·인플루언서 목록이 함께 쓴다.
 */
export function RecommendStrip({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section className={styles.strip} aria-label={title}>
      <div className={styles.head}>
        <span className={styles.eyebrow}>FOR YOU</span>
        <h2 className={styles.title}>{title}</h2>
        {note && <p className={styles.note}>{note}</p>}
      </div>
      {children}
    </section>
  )
}
