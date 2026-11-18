import styles from './LectureThumb.module.css'

type LectureThumbProps = {
  lectureId: number
  title: string
  /** null이면 강의 색 카드로 대신한다. undefined는 아직 주소를 받는 중이라 빈 칸으로 둔다 */
  thumbnailUrl: string | null | undefined
  size?: 'sm' | 'md' | 'big'
  /** 이미지를 불러오지 못했을 때(주소 만료 등) */
  onError?: () => void
}

// 썸네일이 없으면 강의마다 정해진 색 카드로 대신한다(목업의 Thumb).
const PALETTE = [
  ['#1E2A44', '#F4F1EA'],
  ['#EE5A24', '#FFF6F1'],
  ['#0A8659', '#F1FBF6'],
  ['#2C5FD6', '#F2F6FF'],
  ['#A0650C', '#FFF8EC'],
  ['#14161B', '#ECEEF3'],
]

export function LectureThumb({
  lectureId,
  title,
  thumbnailUrl,
  size = 'md',
  onError,
}: LectureThumbProps) {
  const className = `${styles.thumb} ${styles[size]}`
  if (thumbnailUrl === undefined) {
    return (
      <div className={`${className} ${styles.pending}`} aria-hidden="true" />
    )
  }
  if (thumbnailUrl) {
    return (
      <div className={className}>
        <img src={thumbnailUrl} alt="" loading="lazy" onError={onError} />
      </div>
    )
  }
  const [bg, fg] = PALETTE[lectureId % PALETTE.length]
  return (
    <div
      className={`${className} ${styles.fallback}`}
      style={{ background: bg, color: fg }}
      aria-hidden="true"
    >
      <span className={styles.mark} />
      <span className={styles.title}>{title}</span>
    </div>
  )
}
