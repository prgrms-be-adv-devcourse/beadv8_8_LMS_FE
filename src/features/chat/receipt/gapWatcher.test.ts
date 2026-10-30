import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGapWatcher } from './gapWatcher'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

function setup() {
  const onMissing = vi.fn()
  const watcher = createGapWatcher({ graceMs: 1_000, onMissing })
  return { watcher, onMissing }
}

describe('createGapWatcher', () => {
  it('유예 안에 빠진 순번이 모두 오면(순서만 뒤바뀜) 알리지 않는다', () => {
    const { watcher, onMissing } = setup()
    watcher.expect(5, 100, 101)
    vi.advanceTimersByTime(500)
    watcher.arrived(5, [101])
    watcher.arrived(5, [100])
    vi.advanceTimersByTime(10_000)
    expect(onMissing).not.toHaveBeenCalled()
  })

  it('유예 뒤에도 하나라도 비어 있으면 그 방을 한 번 알린다', () => {
    const { watcher, onMissing } = setup()
    watcher.expect(5, 100, 102)
    watcher.arrived(5, [101])
    vi.advanceTimersByTime(999)
    expect(onMissing).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onMissing).toHaveBeenCalledExactlyOnceWith(5)
    vi.advanceTimersByTime(10_000)
    expect(onMissing).toHaveBeenCalledTimes(1)
  })

  it('간격마다 따로 유예를 센다: 늦게 생긴 간격을 먼저 생긴 간격의 마감에 판단하지 않는다', () => {
    const { watcher, onMissing } = setup()
    watcher.expect(5, 100, 100)
    vi.advanceTimersByTime(900)
    watcher.arrived(5, [100])
    watcher.expect(5, 103, 103)
    vi.advanceTimersByTime(200) // 첫 간격의 마감은 지났지만 두 번째 간격은 아직 유예 중
    expect(onMissing).not.toHaveBeenCalled()
    vi.advanceTimersByTime(800)
    expect(onMissing).toHaveBeenCalledExactlyOnceWith(5)
  })

  it('한 방을 알리면 그 방의 다른 대기도 끝낸다(대조가 최신부터 다시 읽는다)', () => {
    const { watcher, onMissing } = setup()
    watcher.expect(5, 100, 100)
    vi.advanceTimersByTime(500)
    watcher.expect(5, 103, 103)
    vi.advanceTimersByTime(500)
    expect(onMissing).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10_000)
    expect(onMissing).toHaveBeenCalledTimes(1)
  })

  it('방마다 따로 판단하고, 다른 방의 순번은 지우지 않는다', () => {
    const { watcher, onMissing } = setup()
    watcher.expect(5, 100, 100)
    watcher.expect(6, 100, 100)
    watcher.arrived(6, [100])
    vi.advanceTimersByTime(1_000)
    expect(onMissing).toHaveBeenCalledExactlyOnceWith(5)
  })

  it('큰 구간도 받은 순번만 빼고 남은 구간으로 판단한다', () => {
    const { watcher, onMissing } = setup()
    watcher.expect(5, 1, 10_000)
    watcher.arrived(
      5,
      Array.from({ length: 9_999 }, (_, i) => i + 1),
    )
    vi.advanceTimersByTime(1_000)
    expect(onMissing).toHaveBeenCalledExactlyOnceWith(5)
  })

  it('버린 방(세대 변경·캐시 삭제)과 dispose 뒤에는 알리지 않는다', () => {
    const { watcher, onMissing } = setup()
    watcher.expect(5, 100, 100)
    watcher.expect(6, 100, 100)
    watcher.discard(5)
    watcher.dispose()
    vi.advanceTimersByTime(10_000)
    expect(onMissing).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
