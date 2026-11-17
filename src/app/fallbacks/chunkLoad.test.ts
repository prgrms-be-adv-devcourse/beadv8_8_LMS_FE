import { describe, expect, it, vi } from 'vitest'
import { isChunkLoadError, reloadOnChunkError, reloadOnce } from './chunkLoad'

const memoryStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

describe('화면 파일 불러오기 실패', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://hapbang.test/assets/WalletPage-a1.js',
    'error loading dynamically imported module: https://hapbang.test/assets/WalletPage-a1.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/WalletPage-a1.css',
  ])('브라우저별 문구를 알아본다: %s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true)
  })

  it('다른 오류는 화면 파일 실패로 보지 않는다', () => {
    expect(isChunkLoadError(new Error('강의를 불러오지 못했어요'))).toBe(false)
    expect(
      isChunkLoadError('Failed to fetch dynamically imported module'),
    ).toBe(false)
  })
})

describe('한 번만 새로고침', () => {
  it('처음 실패하면 새로고침한다', () => {
    const reload = vi.fn()
    expect(reloadOnce(reload, 100_000, memoryStorage())).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('새로고침하고 10초 안에 또 실패하면 반복하지 않는다', () => {
    const storage = memoryStorage()
    const reload = vi.fn()
    reloadOnce(reload, 100_000, storage)
    expect(reloadOnce(reload, 109_999, storage)).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('10초가 지난 뒤 다시 실패하면(다음 배포) 또 새로고침한다', () => {
    const storage = memoryStorage()
    const reload = vi.fn()
    reloadOnce(reload, 100_000, storage)
    expect(reloadOnce(reload, 110_000, storage)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('기록을 남길 수 없으면 새로고침하지 않는다(반복을 막을 수 없다)', () => {
    const reload = vi.fn()
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {},
    }
    expect(reloadOnce(reload, 100_000, blocked)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('화면 파일을 부를 때', () => {
  const stale = new TypeError(
    'Failed to fetch dynamically imported module: https://hapbang.test/assets/WalletPage-old.js',
  )
  const settled = (promise: Promise<unknown>) =>
    Promise.race([
      promise.then(
        () => 'resolved',
        () => 'rejected',
      ),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 20)),
    ])

  it('처음 못 받으면 새로고침하고 오류를 보이지 않고 기다린다', async () => {
    const attempt = vi.fn(() => true)
    const load = reloadOnChunkError(() => Promise.reject(stale), attempt)
    expect(await settled(load())).toBe('pending')
    expect(attempt).toHaveBeenCalledOnce()
  })

  it('새로고침하지 않으면 오류를 그대로 던진다', async () => {
    const load = reloadOnChunkError(
      () => Promise.reject(stale),
      () => false,
    )
    await expect(load()).rejects.toBe(stale)
  })

  it('다른 오류는 새로고침하지 않고 던진다', async () => {
    const attempt = vi.fn(() => true)
    const other = new Error('화면 코드 오류')
    const load = reloadOnChunkError(() => Promise.reject(other), attempt)
    await expect(load()).rejects.toBe(other)
    expect(attempt).not.toHaveBeenCalled()
  })
})
