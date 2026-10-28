import { useSyncExternalStore } from 'react'

/** 사용자가 실제로 이 탭을 보고 있는지(보이고 포커스가 있음). 아니면 읽음 처리하지 않는다. */
export function isPageActive() {
  return document.visibilityState === 'visible' && document.hasFocus()
}

function subscribe(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  window.addEventListener('focus', onChange)
  window.addEventListener('blur', onChange)
  return () => {
    document.removeEventListener('visibilitychange', onChange)
    window.removeEventListener('focus', onChange)
    window.removeEventListener('blur', onChange)
  }
}

/** isPageActive()를 구독한다. 탭을 가리거나 다른 창으로 가면 false, 돌아오면 true */
export function usePageActive() {
  return useSyncExternalStore(subscribe, isPageActive)
}
