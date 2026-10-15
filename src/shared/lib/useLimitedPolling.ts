import { useEffect, useState } from 'react'

/** HP 보류 결과를 기다리는 동안 목록을 다시 부르는 간격·시간 */
export const HOLD_POLL_INTERVAL_MS = 5_000
export const HOLD_POLL_DURATION_MS = 60_000

/** active인 동안 정해진 시간만 true. 그 뒤로는 수동 새로고침에 맡긴다. */
export function useLimitedPolling(active: boolean) {
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setExpired(true), HOLD_POLL_DURATION_MS)
    return () => clearTimeout(timer)
  }, [active])
  return active && !expired
}
