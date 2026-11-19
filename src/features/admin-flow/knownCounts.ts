/**
 * 필터별로 아는 건수. 지금 목록은 이전 목록을 잠시 보이는 동안(placeholder)에는 다른 필터의 값이라 세지 않는다.
 */
export function knownCounts<K extends string>(
  current: {
    filter: K
    total: number | undefined
    isPlaceholderData: boolean
  },
  others: Partial<Record<K, number | undefined>> = {},
): Partial<Record<K, number>> {
  const counts: Partial<Record<K, number>> = {}
  for (const [key, value] of Object.entries(others) as [
    K,
    number | undefined,
  ][])
    if (value !== undefined) counts[key] = value
  if (current.total !== undefined && !current.isPlaceholderData)
    counts[current.filter] = current.total
  return counts
}
