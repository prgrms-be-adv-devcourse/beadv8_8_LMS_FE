import { useEffect, useState } from 'react'

/** 값이 바뀌고 ms 동안 그대로면 그 값을 돌려준다(입력이 잠깐 멈췄을 때만 부르기). 그 전까지는 이전 값이다 */
export function useDebouncedValue<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}
