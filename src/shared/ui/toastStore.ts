import { create } from 'zustand'

const DURATION_MS = 2600

type ToastState = { message: string | null; id: number }

export const useToastStore = create<ToastState>(() => ({
  message: null,
  id: 0,
}))

let timer: ReturnType<typeof setTimeout> | undefined

/**
 * 테스트용: 남은 안내와 지우기 타이머를 모두 없앤다. 스토어가 모듈 전역이라 테스트 사이에 안내가 새지 않게
 * 테스트 공통 설정(src/test/setup.ts)에서 매 테스트 뒤에 부른다. 앱 코드에서는 쓰지 않는다.
 */
export function resetToast() {
  clearTimeout(timer)
  timer = undefined
  useToastStore.setState({ message: null, id: 0 })
}

/** 화면 아래에 짧은 안내를 띄운다. 새 안내가 오면 이전 것을 바꾼다. */
export function toast(message: string) {
  clearTimeout(timer)
  useToastStore.setState((s) => ({ message, id: s.id + 1 }))
  timer = setTimeout(
    () => useToastStore.setState({ message: null }),
    DURATION_MS,
  )
}
