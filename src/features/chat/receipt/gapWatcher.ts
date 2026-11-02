export type GapWatcher = {
  /** 이 방에서 from~to 순번을 아직 받지 못했다. graceMs 뒤에도 하나라도 남아 있으면 onMissing을 부른다 */
  expect: (chatRoomId: number, from: number, to: number) => void
  /** 이 방에서 받은 순번(실시간·이력 조회·대조로 찾은 것) */
  arrived: (chatRoomId: number, sequences: Iterable<number>) => void
  /** 이 방에서 기다리던 간격을 버린다(이력 캐시를 지움·참여 세대가 바뀜) */
  discard: (chatRoomId: number) => void
  /** 모든 대기를 버린다 */
  dispose: () => void
}

/** 아직 받지 못한 순번 구간들과 유예 타이머 */
type Gap = { ranges: [number, number][]; timer: ReturnType<typeof setTimeout> }

/**
 * 실시간 메시지의 방 순번 간격을 바로 누락으로 보지 않고 잠시 기다린다.
 * 서버는 한 STOMP 세션 안에서도 프레임 순서를 보장하지 않으므로 101이 100보다 먼저 올 수 있다.
 * 간격마다 graceMs 뒤에 확인해, 그때도 빠진 순번이 남았을 때만 onMissing으로 대조를 맡긴다.
 * 한 방에서 onMissing을 부르면 그 방의 다른 대기도 함께 끝낸다(대조가 최신 페이지부터 다시 읽는다).
 */
export function createGapWatcher({
  graceMs,
  onMissing,
}: {
  graceMs: number
  onMissing: (chatRoomId: number) => void
}): GapWatcher {
  const rooms = new Map<number, Set<Gap>>()

  const discard = (chatRoomId: number) => {
    const gaps = rooms.get(chatRoomId)
    if (!gaps) return
    for (const gap of gaps) clearTimeout(gap.timer)
    rooms.delete(chatRoomId)
  }

  return {
    expect(chatRoomId, from, to) {
      if (from > to) return
      const gaps = rooms.get(chatRoomId) ?? new Set<Gap>()
      rooms.set(chatRoomId, gaps)
      const gap: Gap = {
        ranges: [[from, to]],
        timer: setTimeout(() => {
          if (!gaps.has(gap)) return
          discard(chatRoomId)
          onMissing(chatRoomId)
        }, graceMs),
      }
      gaps.add(gap)
    },
    arrived(chatRoomId, sequences) {
      const gaps = rooms.get(chatRoomId)
      if (!gaps) return
      for (const sequence of sequences)
        for (const gap of gaps)
          gap.ranges = gap.ranges.flatMap(([from, to]): [number, number][] => {
            if (sequence < from || sequence > to) return [[from, to]]
            const rest: [number, number][] = []
            if (from < sequence) rest.push([from, sequence - 1])
            if (sequence < to) rest.push([sequence + 1, to])
            return rest
          })
      for (const gap of gaps)
        if (gap.ranges.length === 0) {
          clearTimeout(gap.timer)
          gaps.delete(gap)
        }
      if (gaps.size === 0) rooms.delete(chatRoomId)
    },
    discard,
    dispose() {
      for (const chatRoomId of [...rooms.keys()]) discard(chatRoomId)
    },
  }
}
