import type { CSSProperties } from 'react'
import { TOAST_DURATION_MS, useToastStore } from './toastStore'

// 표시 시간 끝 무렵에 CSS로 사라지게 한다(.toast의 toast-out)
const LIFE = { '--toast-life': `${TOAST_DURATION_MS}ms` } as CSSProperties

export function Toast() {
  const { message, id } = useToastStore()
  if (!message) return null
  return (
    <div
      key={id}
      className="toast"
      role="status"
      aria-live="polite"
      style={LIFE}
    >
      {message}
    </div>
  )
}
