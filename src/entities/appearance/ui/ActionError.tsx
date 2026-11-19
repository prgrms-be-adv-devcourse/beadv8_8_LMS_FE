import { isAlreadyHandled } from '../errors'

/** 확인창 안 처리 실패 안내. 창을 닫는 실패(이미 처리됨)는 토스트로 알리므로 그리지 않는다 */
export function ActionError({ error }: { error: Error | null }) {
  if (!error || isAlreadyHandled(error)) return null
  return (
    <div className="notice bad" role="alert">
      {error.message}
    </div>
  )
}
