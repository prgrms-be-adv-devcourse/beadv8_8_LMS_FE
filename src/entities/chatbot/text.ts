/**
 * 챗봇 글자 수 규칙. BE는 글자를 코드 포인트로 센다(이모지 하나가 1자, BE CodePointSize·ChatHistory).
 * String.length(UTF-16 단위)로 세면 이모지가 2자가 되어 BE와 어긋난다.
 */

/** 자유 질문 한 번의 최대 글자 수 */
export const MESSAGE_MAX_LENGTH = 500

/** 관심사(앞뒤 공백 제외) 최대 글자 수 */
export const INTEREST_MAX_LENGTH = 100

/** 코드 포인트로 센 글자 수 */
export function textLength(text: string): number {
  return Array.from(text).length
}

/** 앞에서부터 max글자(코드 포인트)까지 자른다. 이모지를 반으로 자르지 않는다 */
export function truncateText(text: string, max: number): string {
  if (textLength(text) <= max) return text
  return Array.from(text).slice(0, max).join('')
}

/** 관심사를 보낼 값으로 바꾼다. 앞뒤 공백을 빼고, 비었거나 100자를 넘으면 null(보내지 않는다) */
export function normalizeInterest(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed || textLength(trimmed) > INTEREST_MAX_LENGTH) return null
  return trimmed
}
