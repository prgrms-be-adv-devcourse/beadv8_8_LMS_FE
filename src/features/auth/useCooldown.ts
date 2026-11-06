import { useEffect, useState } from 'react'

/**
 * 다시 할 수 있을 때까지 남은 초. 처음 seconds초부터 1초마다 줄어 0에서 멈춘다.
 * start(seconds)로 다시 센다(코드를 다시 받은 뒤 등).
 */
export function useCooldown(seconds: number) {
  const [clock, setClock] = useState(() => {
    const now = Date.now()
    return { until: now + seconds * 1000, now }
  })
  const { until } = clock
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now()
      setClock((prev) => ({ ...prev, now }))
      if (now >= until) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [until])

  return {
    left: Math.max(0, Math.ceil((clock.until - clock.now) / 1000)),
    start: (next: number) => {
      const now = Date.now()
      setClock({ until: now + next * 1000, now })
    },
  }
}
