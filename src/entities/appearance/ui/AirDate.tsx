import { daysUntil, isPast, parseServerDate } from '@/shared/lib/date'
import styles from './AirDate.module.css'

const partsFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function partsOf(value: string) {
  const parts = partsFormatter.formatToParts(parseServerDate(value))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return {
    month: get('month'),
    day: get('day'),
    weekday: get('weekday'),
    time: `${get('hour')}:${get('minute')}`,
  }
}

/**
 * 방송 일시를 달력 조각처럼 크게 보이는 장식. 같은 일시는 옆 글자(방송 10/20(화) 21:00)로 읽히므로
 * 화면 낭독기에는 숨긴다. 오늘 방송이면 머리를 신호색(탤리 램프)으로 켠다.
 */
export function AirDate({
  value,
  size = 'md',
}: {
  value: string
  size?: 'md' | 'lg'
}) {
  const { month, day, weekday, time } = partsOf(value)
  const today = !isPast(value) && daysUntil(value) === 0
  const className = [
    styles.chip,
    size === 'lg' && styles.lg,
    today && styles.today,
    isPast(value) && styles.past,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={className} aria-hidden="true">
      <span className={styles.month}>{today ? 'TODAY' : `${month}월`}</span>
      <span className={styles.day}>{day}</span>
      <span className={styles.meta}>
        {weekday} · {time}
      </span>
    </span>
  )
}
