import { isApiError } from '@/shared/api/ApiError'

/**
 * 그사이 다른 처리가 먼저 반영돼 다시 눌러도 같은 결과인 실패(BE AppearanceErrorCode).
 * 확인창은 이때만 닫고 바뀐 상태를 다시 불러온다. 그 밖의 실패(연결 끊김·잔액 부족 등)는 창 안에 남겨 다시 누를 수 있게 한다.
 */
const ALREADY_HANDLED = new Set([
  'APPLICATION_NOT_PENDING',
  'APPEARANCE_RECRUIT_NOT_OPEN',
  'RECRUIT_FULL',
  'APPEARANCE_REQUEST_MODIFIED',
  'APPEARANCE_REQUEST_NOT_AWAITING_RESPONSE',
  'APPEARANCE_REQUEST_EXPIRED',
  'CONCURRENT_UPDATE',
])

export function isAlreadyHandled(error: Error) {
  return isApiError(error) && ALREADY_HANDLED.has(error.code)
}

/** 확인창 처리 결과: 성공하거나 이미 처리됐으면 닫고(다시 불러온다), 그 밖의 실패는 창 안에 남긴다 */
export const closeWhenDone = (onClose: () => void) => ({
  onSuccess: onClose,
  onError: (error: Error) => {
    if (isAlreadyHandled(error)) onClose()
  },
})
