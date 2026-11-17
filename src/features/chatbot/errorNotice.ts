import { isApiError } from '@/shared/api/ApiError'

/**
 * 챗봇 요청이 실패했을 때 대화에 남길 안내. 화면 분기는 code로만 한다.
 * - 429 TOO_MANY_REQUESTS: 자동으로 다시 시도하지 않고 기다릴 시간을 알린다(Retry-After가 있으면 초까지)
 * - 400 INVALID_REQUEST: 글자 수 오류(보내기 전에 막지만 BE가 거절하면 invalid 문구)
 * - 400 INVALID_CHAT_HISTORY: 지난 대화 형식 오류(history 규칙을 지키면 나지 않는다)
 * - 로그인이 끝났으면 전역 처리가 로그인 안내를 띄우고 대화도 비우므로 여기 문구는 잠깐만 보인다
 */
export function errorNotice(
  error: unknown,
  { fallback, invalid }: { fallback: string; invalid: string },
): string {
  if (isApiError(error, 'TOO_MANY_REQUESTS'))
    return error.retryAfter
      ? `요청이 많아요. ${error.retryAfter}초 뒤에 다시 시도해 주세요.`
      : '요청이 많아요. 잠시 뒤 다시 시도해 주세요.'
  if (isApiError(error, 'INVALID_REQUEST')) return invalid
  if (isApiError(error, 'INVALID_CHAT_HISTORY'))
    return '지난 대화를 보내지 못했어요. 새 대화를 눌러 다시 물어봐 주세요.'
  return fallback
}

/**
 * 새 대화·로그아웃으로 요청을 끊었는지(안내를 남기지 않는다). fetch가 던지는 AbortError는 실행 환경마다 DOMException
 * 클래스가 달라 instanceof 대신 이름으로 본다.
 */
export function isAborted(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}
