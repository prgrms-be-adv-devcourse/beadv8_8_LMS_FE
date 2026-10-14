const KST = 'Asia/Seoul'

/**
 * BE는 시간대 없는 LocalDateTime(서버 시간대 = KST)을 내려준다. 시간대가 없으면 KST로 읽는다.
 * 모든 날짜는 KST로 표시한다.
 */
export function parseServerDate(value: string): Date {
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value)
  return new Date(hasZone ? value : `${value}+09:00`)
}

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: KST,
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
})

const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: KST,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** 10/14(화) */
export function formatDate(value: string): string {
  const parts = dateFormatter.formatToParts(parseServerDate(value))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `${get('month')}/${get('day')}(${get('weekday')})`
}

/** 10/14(화) 20:00 */
export function formatDateTime(value: string): string {
  return `${formatDate(value)} ${timeFormatter.format(parseServerDate(value))}`
}

/** 기한이 지났는지 */
export function isPast(value: string, now = new Date()): boolean {
  return parseServerDate(value).getTime() <= now.getTime()
}
