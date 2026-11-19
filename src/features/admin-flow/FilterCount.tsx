import { formatNumber } from '@/shared/lib/money'
import styles from './FilterCount.module.css'

/**
 * 관리자 상태 필터 버튼의 건수. 따로 세지 않고 이미 아는 값(지금 보는 목록의 전체 건수, 머리글이 세는 대기 건수)만 보인다.
 * 버튼 이름에 함께 읽힌다(예: '승인 대기 3건').
 */
export function FilterCount({ count }: { count: number | undefined }) {
  if (count === undefined) return null
  // 띄어쓰기를 span 밖에 둬야 접근성 이름이 '승인 대기 3건'으로 띄어 읽힌다.
  return (
    <>
      {' '}
      <span className={styles.count}>{formatNumber(count)}건</span>
    </>
  )
}
