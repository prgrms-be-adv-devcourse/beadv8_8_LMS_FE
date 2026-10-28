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

/**
 * datetime-local 입력값(YYYY-MM-DDTHH:mm, KST로 본다)을 BE LocalDateTime(초까지)으로.
 * BE는 시간대 없는 KST 값을 받는다.
 */
export function toServerDateTime(localInput: string): string {
  return localInput.length === 16 ? `${localInput}:00` : localInput
}

/** 지금부터 days일 뒤 hh:mm(KST)을 datetime-local 입력값으로. 기본값 채우기용 */
export function kstLocalInput(
  days = 0,
  time?: string,
  now = new Date(),
): string {
  const shifted = new Date(now.getTime() + 9 * 3600_000 + days * 86_400_000)
  const date = shifted.toISOString().slice(0, 10)
  return `${date}T${time ?? shifted.toISOString().slice(11, 16)}`
}

/** 기한까지 남은 날 (KST 날짜 기준). 오늘이면 0, 지났으면 음수 */
export function daysUntil(value: string, now = new Date()): number {
  const day = (d: Date) => Math.floor((d.getTime() + 9 * 3600_000) / 86_400_000)
  return day(parseServerDate(value)) - day(now)
}

/** D-3, D-day, 지났으면 마감 */
export function formatDday(value: string, now = new Date()): string {
  const days = daysUntil(value, now)
  if (isPast(value, now)) return '마감'
  return days === 0 ? 'D-day' : `D-${days}`
}
