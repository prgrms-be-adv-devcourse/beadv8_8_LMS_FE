import { create } from 'zustand'

const DURATION_MS = 2600

type ToastState = { message: string | null; id: number }

export const useToastStore = create<ToastState>(() => ({
  message: null,
  id: 0,
}))

let timer: ReturnType<typeof setTimeout> | undefined

/** 화면 아래에 짧은 안내를 띄운다. 새 안내가 오면 이전 것을 바꾼다. */
export function toast(message: string) {
  clearTimeout(timer)
  useToastStore.setState((s) => ({ message, id: s.id + 1 }))
  timer = setTimeout(
    () => useToastStore.setState({ message: null }),
    DURATION_MS,
  )
}
