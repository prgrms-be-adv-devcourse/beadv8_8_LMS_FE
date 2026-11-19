import type { CSSProperties } from 'react'
import { pauseToast, resumeToast, useToastStore } from './toastStore'

/**
 * 화면 아래 짧은 안내.
 * 낭독기는 처음부터 있던 알림 영역(role="status")의 내용이 바뀔 때만 읽으므로, 영역은 늘 두고 그 안에 안내를 그린다.
 * 오류 안내는 영역 밖에 role="alert"로 그려 바로 읽게 한다(alert는 나타날 때 읽는다).
 * 포인터나 포커스가 안내 위에 있으면 사라지지 않게 멈춘다.
 */
export function Toast() {
  const { message, id, tone, duration, paused } = useToastStore()
  const bubble = message && (
    <div
      key={id}
      className="toast"
      role={tone === 'error' ? 'alert' : undefined}
      data-tone={tone}
      data-paused={paused || undefined}
      // 표시 시간 끝 무렵에 CSS로 사라지게 한다(.toast의 toast-out)
      style={{ '--toast-life': `${duration}ms` } as CSSProperties}
      onPointerEnter={pauseToast}
      onPointerLeave={resumeToast}
      onFocus={pauseToast}
      onBlur={resumeToast}
    >
      {message}
    </div>
  )
  return (
    <>
      <div className="toast-region" role="status" aria-live="polite">
        {tone === 'info' && bubble}
      </div>
      {tone === 'error' && bubble}
    </>
  )
}
