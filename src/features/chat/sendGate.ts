/**
 * 서버 결과를 기다리는 전송의 동시 개수를 제한한다(서버는 연결당 처리 대기 프레임 상한을 넘으면 4500으로 닫는다).
 * 상한까지는 바로 보내고, 넘으면 맡긴 순서대로 기다렸다가 앞선 전송의 결과가 나오면 다음 것을 보낸다.
 * 전송은 임시 ID(clientMessageId)로 구분한다.
 */
export function createSendGate(limit: number) {
  /** 보내고 결과를 기다리는 전송 */
  const inFlight = new Set<string>()
  /** 자리가 나기를 기다리는 전송(맡긴 순) */
  let queue: { id: string; send: () => boolean }[] = []

  const pump = () => {
    while (inFlight.size < limit && queue.length > 0) {
      const next = queue.shift()!
      // 보내는 동안 상태가 바뀌어 다시 불려도 상한을 넘지 않게 먼저 자리를 잡는다.
      inFlight.add(next.id)
      if (!next.send()) inFlight.delete(next.id)
    }
  }

  return {
    /** 전송을 맡긴다. 자리가 있으면 바로 보낸다. send는 실제로 보냈으면(결과를 기다리면) true를 돌려준다 */
    submit(id: string, send: () => boolean) {
      queue = queue.filter((q) => q.id !== id)
      queue.push({ id, send })
      pump()
    },
    /** 결과가 나온 전송의 자리를 비우고 다음 것을 보낸다 */
    settle(id: string) {
      if (inFlight.delete(id)) pump()
    },
    /** keep이 false인 전송(결과가 났거나 버린 것)을 정리한다. 기다리던 전송은 보내지 않고 버린다 */
    retain(keep: (id: string) => boolean) {
      queue = queue.filter((q) => keep(q.id))
      let freed = false
      for (const id of inFlight)
        if (!keep(id)) {
          inFlight.delete(id)
          freed = true
        }
      if (freed) pump()
    },
    /** 보내고 결과를 기다리는 중인지(자리를 기다리는 중이면 false) */
    isInFlight(id: string) {
      return inFlight.has(id)
    },
  }
}
