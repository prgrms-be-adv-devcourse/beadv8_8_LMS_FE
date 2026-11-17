/**
 * 화면 파일(나눠 불러오는 JS) 불러오기 실패.
 * 배포하면 옛 해시 파일이 사라지므로, 배포 전에 연 탭이 다른 화면으로 가면 이 오류가 난다. 새로고침하면 새 파일을 받는다.
 * 브라우저마다 문구가 다르다(Chrome·Edge, Firefox, Safari, Vite CSS 미리 불러오기).
 */
const CHUNK_LOAD_MESSAGES = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Unable to preload CSS',
]

export function isChunkLoadError(error: unknown): boolean {
  return (
    error instanceof Error &&
    CHUNK_LOAD_MESSAGES.some((text) => error.message.includes(text))
  )
}

const RELOADED_AT_KEY = 'hapbang:chunk-reloaded-at'
/** 이 시간 안에 또 실패하면 새로고침을 반복하지 않고 안내를 보인다 */
const RELOAD_GUARD_MS = 10_000

/** 새로고침. 테스트에서 바꿔 끼울 수 있게 객체로 둔다(jsdom의 location.reload는 바꿀 수 없다) */
export const page = { reload: () => location.reload() }

/**
 * 새로고침을 한 번만 한다. 했으면 true, 방금 새로고침했는데 또 실패했거나 기록을 남길 수 없으면 false(안내를 보인다).
 * 기록을 남길 수 없을 때 새로고침하면 끝없이 반복할 수 있어 하지 않는다.
 * 네트워크가 끊겨 화면 파일을 못 받은 경우도 브라우저 문구가 같아 구분하지 못한다. 이때도 한 번 새로고침하고,
 * 안내 문구가 두 경우(새 버전·연결 끊김)를 함께 말한다.
 */
export function reloadOnce(
  reload: () => void = () => page.reload(),
  now: number = Date.now(),
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage,
): boolean {
  try {
    const last = Number(storage.getItem(RELOADED_AT_KEY) ?? 0)
    if (now - last < RELOAD_GUARD_MS) return false
    storage.setItem(RELOADED_AT_KEY, String(now))
  } catch {
    return false
  }
  reload()
  return true
}

/**
 * 화면 파일을 못 받으면 한 번 새로고침한다. 새로고침하는 동안은 끝나지 않는 Promise로 기다려 오류 화면이 잠깐 보이지 않게 한다.
 * 새로고침하지 않으면(방금 했음·기록 불가) 오류를 그대로 던져 RouteErrorPage가 안내한다.
 */
export function reloadOnChunkError<T>(
  load: () => Promise<T>,
  attemptReload: () => boolean = reloadOnce,
): () => Promise<T> {
  return () =>
    load().catch((error: unknown) => {
      if (isChunkLoadError(error) && attemptReload())
        return new Promise<T>(() => {})
      throw error
    })
}
