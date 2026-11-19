import { create } from 'zustand'

/** info는 알림(role="status"), error는 실패 안내(role="alert")로 더 오래 둔다 */
export type ToastTone = 'info' | 'error'

type ToastOptions = { tone?: ToastTone }

/** 표시 시간: 기본에 글자 수만큼 더하고 상한에서 자른다. 오류는 다시 읽을 수 있게 더 오래 둔다 */
const BASE_MS = { info: 2600, error: 5000 } satisfies Record<ToastTone, number>
const PER_CHAR_MS = 60
const MAX_MS = 10_000

/** 안내 문구를 읽을 만큼 띄워 둘 시간(ms) */
export function toastDuration(message: string, tone: ToastTone = 'info') {
  return Math.min(BASE_MS[tone] + [...message].length * PER_CHAR_MS, MAX_MS)
}

type ToastState = {
  message: string | null
  id: number
  tone: ToastTone
  /** 이번 안내를 띄워 둘 시간. Toast가 같은 값으로 사라지는 움직임을 맞춘다 */
  duration: number
  /** 포인터·포커스가 올라가 있어 멈춘 동안 true */
  paused: boolean
}

const INITIAL: ToastState = {
  message: null,
  id: 0,
  tone: 'info',
  duration: 0,
  paused: false,
}

export const useToastStore = create<ToastState>(() => INITIAL)

let timer: ReturnType<typeof setTimeout> | undefined
/** 남은 시간과 그 시간을 재기 시작한 때. 멈추면 남은 시간만 남긴다 */
let remaining = 0
let startedAt = 0

function startTimer(ms: number) {
  clearTimeout(timer)
  remaining = ms
  startedAt = Date.now()
  timer = setTimeout(() => {
    timer = undefined
    useToastStore.setState({ message: null, paused: false })
  }, ms)
}

/**
 * 테스트용: 남은 안내와 지우기 타이머를 모두 없앤다. 스토어가 모듈 전역이라 테스트 사이에 안내가 새지 않게
 * 테스트 공통 설정(src/test/setup.ts)에서 매 테스트 뒤에 부른다. 앱 코드에서는 쓰지 않는다.
 */
export function resetToast() {
  clearTimeout(timer)
  timer = undefined
  remaining = 0
  useToastStore.setState(INITIAL)
}

/**
 * 화면 아래에 짧은 안내를 띄운다. 새 안내가 오면 이전 것을 바꾼다.
 * 요청 실패처럼 사용자가 놓치면 안 되는 안내는 { tone: 'error' }로 띄운다(낭독기가 바로 읽고 더 오래 남는다).
 */
export function toast(message: string, { tone = 'info' }: ToastOptions = {}) {
  const duration = toastDuration(message, tone)
  useToastStore.setState((s) => ({
    message,
    tone,
    duration,
    id: s.id + 1,
    paused: false,
  }))
  startTimer(duration)
}

/** 포인터·포커스가 안내 위에 있으면 사라지지 않게 멈춘다 */
export function pauseToast() {
  const { message, paused } = useToastStore.getState()
  if (!message || paused || timer === undefined) return
  clearTimeout(timer)
  timer = undefined
  remaining = Math.max(remaining - (Date.now() - startedAt), 0)
  useToastStore.setState({ paused: true })
}

/** 멈춘 안내를 남은 시간만큼 다시 띄워 둔다 */
export function resumeToast() {
  const { message, paused } = useToastStore.getState()
  if (!message || !paused) return
  useToastStore.setState({ paused: false })
  startTimer(remaining)
}
