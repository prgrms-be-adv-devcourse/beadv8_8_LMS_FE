import { useEffect, useRef } from 'react'
import { isApiError } from '@/shared/api/ApiError'

/**
 * 돈이 움직이는 관리자 처리(확인 창)의 실패 안내 규칙.
 * - 확인 창이 열려 있으면 실패 사유를 창 안(role="alert")에 남기고 버튼을 '다시 시도'로 바꾼다. 토스트는 띄우지 않는다
 * - 상태가 바뀌어 다시 보낼 수 없는 오류(이미 처리됨·없음)는 창을 닫고 토스트로 알린다
 * - 응답 전에 창을 닫았으면 남길 곳이 없어 토스트로 알린다
 * 401·403은 queryClient의 MutationCache가 전역으로 안내한다.
 */
export function isGlobalAuthError(error: unknown) {
  return (
    (isApiError(error) && error.sessionEnded) || isApiError(error, 'FORBIDDEN')
  )
}

/** 응답을 받지 못한 실패(연결 끊김 등)는 BE가 처리했는지 모른다 */
export function fallbackActionMessage(error: Error) {
  if (isApiError(error)) return error.message
  return '응답을 받지 못했어요. 처리됐는지 최신 상태를 확인한 뒤 다시 시도해 주세요.'
}

/** 훅을 쓰는 확인 창이 아직 열려 있는지. 훅 수준 콜백은 창이 닫혀도 불려서 따로 본다 */
export function useMountedRef() {
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}
