import { isApiError } from '@/shared/api/ApiError'

/**
 * 챗봇 요청이 실패했을 때 대화에 남길 안내. 화면 분기는 code로만 한다.
 * - 429 TOO_MANY_REQUESTS: 자동으로 다시 시도하지 않고 기다릴 시간을 알린다(Retry-After가 있으면 초까지)
 * - 400 INVALID_REQUEST: 관심사·질문 글자 수 오류(보내기 전에 막지만 BE가 거절하면)
 * - 로그인이 끝났으면 전역 처리가 로그인 안내를 띄우고 대화도 비우므로 여기 문구는 잠깐만 보인다
 */
export function errorNotice(error: unknown, fallback: string): string {
  if (isApiError(error, 'TOO_MANY_REQUESTS'))
    return error.retryAfter
      ? `요청이 많아요. ${error.retryAfter}초 뒤에 다시 시도해 주세요.`
      : '요청이 많아요. 잠시 뒤 다시 시도해 주세요.'
  if (isApiError(error, 'INVALID_REQUEST'))
    return '관심사는 앞뒤 공백을 빼고 1~100자로 적어 주세요.'
  return fallback
}

/** 새 대화·로그아웃으로 요청을 끊었는지(안내를 남기지 않는다) */
export function isAborted(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}
