import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAckQueue } from './ackQueue'
import type { AckResult, ReceiptAck } from './contract'

const policy = {
  debounceMs: 1_000,
  maxWaitMs: 5_000,
  maxPendingCount: 3,
  maxPendingRooms: 2,
  maxRetries: 2,
  retryBaseMs: 100,
  maxReopenCycles: 2,
}

const ack = (
  chatRoomId: number,
  receivedSequence: number,
  participationVersion = 1,
): ReceiptAck => ({ chatRoomId, participationVersion, receivedSequence })

/** 응답을 테스트가 정하는 전송. 기본은 바로 ok */
function fakeTransport(auto: AckResult | null = 'ok') {
  const resolvers: ((r: AckResult) => void)[] = []
  const send = vi.fn<
    (ack: ReceiptAck, signal?: AbortSignal) => Promise<AckResult>
  >(() =>
    auto
      ? Promise.resolve(auto)
      : new Promise<AckResult>((resolve) => resolvers.push(resolve)),
  )
  return {
    transport: { send },
    send,
    /** 가장 오래된 미응답 전송에 답한다 */
    respond: async (result: AckResult) => {
      resolvers.shift()?.(result)
      await vi.advanceTimersByTimeAsync(0)
    },
    sentValues: () => send.mock.calls.map(([a]) => a.receivedSequence),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createAckQueue', () => {
  it('방별 debounce 동안 들어온 확인을 가장 높은 값 하나로 합쳐 보낸다', async () => {
    const t = fakeTransport()
    const queue = createAckQueue({
      transport: t.transport,
      policy,
      onStale: vi.fn(),
    })
    queue.offer(ack(5, 101))
    await vi.advanceTimersByTimeAsync(500)
    queue.offer(ack(5, 102))
    await vi.advanceTimersByTimeAsync(999)
    expect(t.send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(t.send).toHaveBeenCalledExactlyOnceWith(
      ack(5, 102),
      expect.any(AbortSignal),
    )
    expect(queue.pendingRooms()).toBe(0)
  })

  it('계속 들어와도 첫 확인 뒤 maxWait 안에는 보낸다', async () => {
    const t = fakeTransport()
    const queue = createAckQueue({
      transport: t.transport,
      policy,
      onStale: vi.fn(),
    })
    queue.offer(ack(5, 1))
    // maxPendingCount(3)에 닿지 않게 두 번만 더 올린다
    await vi.advanceTimersByTimeAsync(900)
    queue.offer(ack(5, 2))
    await vi.advanceTimersByTimeAsync(900)
    expect(t.send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(900)
    expect(t.send).toHaveBeenCalledTimes(1)

    // 새 구간: debounce가 계속 밀려도 maxWait에 보낸다
    t.send.mockClear()
    const queue2 = createAckQueue({
      transport: t.transport,
      policy: { ...policy, maxPendingCount: 100 },
      onStale: vi.fn(),
    })
    for (let seq = 1; seq <= 10; seq += 1) {
      queue2.offer(ack(6, seq))
      await vi.advanceTimersByTimeAsync(600)
    }
    expect(t.sentValues()).toEqual([9])
  })

  it('보내지 않은 확인이 maxPendingCount만큼 쌓이면 바로 보낸다', () => {
    const t = fakeTransport()
    const queue = createAckQueue({
      transport: t.transport,
      policy,
      onStale: vi.fn(),
    })
    queue.offer(ack(5, 1))
    queue.offer(ack(5, 2))
    expect(t.send).not.toHaveBeenCalled()
    queue.offer(ack(5, 3))
    expect(t.sentValues()).toEqual([3])
  })

  it('같거나 낮은 값과 이미 확정된 값은 무시한다', async () => {
    const t = fakeTransport()
    const queue = createAckQueue({
      transport: t.transport,
      policy,
      onStale: vi.fn(),
    })
    queue.offer(ack(5, 10))
    queue.offer(ack(5, 9))
    queue.offer(ack(5, 10))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(t.sentValues()).toEqual([10])
    queue.offer(ack(5, 10))
    queue.offer(ack(5, 7))
    expect(queue.pendingRooms()).toBe(0)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.sentValues()).toEqual([10])
  })

  it('대기 방이 maxPendingRooms를 넘으면 가장 오래 기다린 방부터 보낸다', () => {
    const t = fakeTransport()
    const queue = createAckQueue({
      transport: t.transport,
      policy,
      onStale: vi.fn(),
    })
    queue.offer(ack(1, 10))
    queue.offer(ack(2, 20))
    queue.offer(ack(1, 11))
    expect(t.send).not.toHaveBeenCalled()
    queue.offer(ack(3, 30))
    expect(t.send).toHaveBeenCalledExactlyOnceWith(
      ack(1, 11),
      expect.any(AbortSignal),
    )
    expect(queue.pendingRooms()).toBe(2)
  })

  it('flushAll은 기다리는 방을 모두 지금 보낸다', () => {
    const t = fakeTransport()
    const queue = createAckQueue({
      transport: t.transport,
      policy,
      onStale: vi.fn(),
    })
    queue.offer(ack(1, 10))
    queue.offer(ack(2, 20))
    queue.flushAll()
    expect(t.sentValues()).toEqual([10, 20])
  })

  it('방마다 한 번에 하나만 보내고, 끝난 뒤 그동안 쌓인 최신 값을 보낸다', async () => {
    const t = fakeTransport(null)
    const queue = createAckQueue({
      transport: t.transport,
      policy,
      onStale: vi.fn(),
    })
    queue.offer(ack(5, 1))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(t.sentValues()).toEqual([1])
    queue.offer(ack(5, 2))
    queue.offer(ack(5, 4))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(t.sentValues()).toEqual([1])
    await t.respond('ok')
    expect(t.sentValues()).toEqual([1, 4])
    await t.respond('ok')
    // 확정 값 이하는 다시 보내지 않는다
    queue.offer(ack(5, 3))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(t.sentValues()).toEqual([1, 4])
  })

  it('실패하면 지수 대기 후 같은 세대의 최신 값으로 다시 보내고, 상한을 넘으면 그 실패 연쇄는 포기하고 다시 열 때까지 기다린다', async () => {
    const t = fakeTransport(null)
    const queue = createAckQueue({
      transport: t.transport,
      policy,
      onStale: vi.fn(),
    })
    queue.offer(ack(5, 1))
    queue.flushAll()
    await t.respond('retry')
    queue.offer(ack(5, 2))
    await vi.advanceTimersByTimeAsync(99)
    expect(t.sentValues()).toEqual([1])
    await vi.advanceTimersByTimeAsync(1)
    // 첫 다시 보내기(100ms)는 그사이 들어온 최신 값으로 보낸다
    expect(t.sentValues()).toEqual([1, 2])

    t.send.mockImplementationOnce(() => Promise.reject(new Error('network')))
    await t.respond('retry')
    await vi.advanceTimersByTimeAsync(200)
    expect(t.sentValues()).toEqual([1, 2, 2])
    // 던진 오류도 실패로 센다. 다시 보내기 2번을 다 썼으니 포기한다
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.sentValues()).toEqual([1, 2, 2])
    expect(queue.pendingRooms()).toBe(0)

    // 같은 실패 연쇄 안에서는 같은 값을 다시 내놓아도 재시도 상한을 우회해 다시 보내지 않는다
    queue.offer(ack(5, 2))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(t.sentValues()).toEqual([1, 2, 2])

    // 다음 대조 주기(재연결·재동기화)가 다시 열면 회복 뒤 같은 값을 다시 보낸다
    queue.reopenExhausted()
    queue.offer(ack(5, 2))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(t.sentValues()).toEqual([1, 2, 2, 2])
  })

  it('계속 실패하면 주기 대조는 정해진 횟수까지만 다시 열고, 재연결·재동기화(force)는 다시 연다', async () => {
    const t = fakeTransport('retry')
    const queue = createAckQueue({
      transport: t.transport,
      policy,
      onStale: vi.fn(),
    })
    const failChain = async () => {
      queue.offer(ack(5, 7))
      queue.flushAll()
      await vi.advanceTimersByTimeAsync(10_000)
    }
    await failChain()
    expect(t.send).toHaveBeenCalledTimes(policy.maxRetries + 1)

    // 주기 대조 두 번까지는 다시 열어 실패 연쇄를 한 번 더 돈다
    for (let i = 0; i < policy.maxReopenCycles; i++) {
      queue.reopenExhausted()
      await failChain()
    }
    const afterCycles = t.send.mock.calls.length
    expect(afterCycles).toBe(
      (policy.maxRetries + 1) * (policy.maxReopenCycles + 1),
    )

    // 상한 뒤의 주기 대조는 열지 않는다
    queue.reopenExhausted()
    await failChain()
    expect(t.send).toHaveBeenCalledTimes(afterCycles)

    // 재연결·재동기화는 연다
    queue.reopenExhausted({ force: true })
    await failChain()
    expect(t.send.mock.calls.length).toBeGreaterThan(afterCycles)
    queue.dispose()
  })

  it('다시 보내기를 기다리는 방도 대기 방 상한에 넣는다', async () => {
    const t = fakeTransport('retry')
    const queue = createAckQueue({
      transport: t.transport,
      policy,
      onStale: vi.fn(),
    })
    for (const room of [1, 2, 3, 4, 5]) {
      queue.offer(ack(room, 1))
      queue.flushAll()
    }
    await vi.advanceTimersByTimeAsync(0)
    // 모두 실패해 다시 보내기를 기다리지만 상한(2)만큼만 남는다
    expect(vi.getTimerCount()).toBeLessThanOrEqual(policy.maxPendingRooms)
    queue.dispose()
  })

  it('거절(drop)된 값은 다시 열어도 같은 값으로 다시 보내지 않고, 더 높은 값이면 보낸다', async () => {
    const t = fakeTransport('drop')
    const queue = createAckQueue({
      transport: t.transport,
      policy,
      onStale: vi.fn(),
    })
    queue.offer(ack(5, 4))
    queue.flushAll()
    await vi.advanceTimersByTimeAsync(0)
    queue.reopenExhausted()
    queue.offer(ack(5, 4))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(t.sentValues()).toEqual([4])
    queue.offer(ack(5, 5))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(t.sentValues()).toEqual([4, 5])
  })

  it('보내는 중인 방의 대기 값도 방 수 상한에 넣고, 넘으면 가장 오래 기다린 대기 값을 버린다', () => {
    // 응답이 오지 않는 전송: 모든 방이 보내는 중으로 남는다
    const t = fakeTransport(null)
    const queue = createAckQueue({
      transport: t.transport,
      policy,
      onStale: vi.fn(),
    })
    for (const room of [1, 2, 3, 4, 5]) {
      queue.offer(ack(room, 1))
      queue.flushAll()
    }
    // 보내는 중에 새 확인이 들어와 방마다 대기 값이 생긴다
    for (const room of [1, 2, 3, 4, 5]) queue.offer(ack(room, 2))

    expect(queue.pendingRooms()).toBeLessThanOrEqual(policy.maxPendingRooms)
    queue.dispose()
  })

  it('폐기하면 진행 중인 전송의 취소 신호를 보낸다(로그아웃 뒤 다른 회원 세션으로 나가지 않게)', () => {
    const t = fakeTransport(null)
    const queue = createAckQueue({
      transport: t.transport,
      policy,
      onStale: vi.fn(),
    })
    queue.offer(ack(5, 1))
    queue.flushAll()
    const signal = t.send.mock.calls[0][1] as AbortSignal
    expect(signal.aborted).toBe(false)
    queue.dispose()
    expect(signal.aborted).toBe(true)
  })

  it('ok를 받으면 실패 횟수를 다시 센다', async () => {
    const t = fakeTransport(null)
    const queue = createAckQueue({
      transport: t.transport,
      policy,
      onStale: vi.fn(),
    })
    queue.offer(ack(5, 1))
    queue.flushAll()
    await t.respond('retry')
    await vi.advanceTimersByTimeAsync(100)
    await t.respond('ok')
    queue.offer(ack(5, 2))
    queue.flushAll()
    await t.respond('retry')
    await vi.advanceTimersByTimeAsync(100)
    await t.respond('retry')
    await vi.advanceTimersByTimeAsync(200)
    expect(t.sentValues()).toEqual([1, 1, 2, 2, 2])
  })

  it('stale이면 방 대기를 버리고 onStale을 부른다', async () => {
    const t = fakeTransport(null)
    const onStale = vi.fn()
    const queue = createAckQueue({ transport: t.transport, policy, onStale })
    queue.offer(ack(5, 1))
    queue.flushAll()
    queue.offer(ack(5, 2))
    await t.respond('stale')
    expect(onStale).toHaveBeenCalledExactlyOnceWith(5, true)
    expect(queue.pendingRooms()).toBe(0)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.sentValues()).toEqual([1])
  })

  it('drop이면 조용히 버리고 다시 보내지 않는다', async () => {
    const t = fakeTransport('drop')
    const onStale = vi.fn()
    const queue = createAckQueue({ transport: t.transport, policy, onStale })
    queue.offer(ack(5, 1))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.sentValues()).toEqual([1])
    expect(onStale).not.toHaveBeenCalled()
  })

  it('참여 세대가 바뀌면 옛 세대 대기를 버리고 확정 값도 새로 센다', async () => {
    const t = fakeTransport(null)
    const onStale = vi.fn()
    const queue = createAckQueue({ transport: t.transport, policy, onStale })
    queue.offer(ack(5, 50, 1))
    queue.flushAll()
    await t.respond('ok')
    queue.offer(ack(5, 60, 1))
    queue.offer(ack(5, 3, 2))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(t.send.mock.calls.map(([a]) => a)).toEqual([
      ack(5, 50, 1),
      ack(5, 3, 2),
    ])

    // 세대가 다시 바뀐 뒤 도착한 옛 전송의 응답(3: ok, 70: stale)은 지금 세대에 반영하지 않는다
    queue.offer(ack(5, 70, 1))
    queue.flushAll()
    queue.offer(ack(5, 4, 2))
    await t.respond('ok')
    await t.respond('stale')
    expect(onStale).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(t.sentValues()).toEqual([50, 3, 70, 4])
  })

  it('discard·dispose는 타이머와 대기를 버린다', async () => {
    const t = fakeTransport()
    const queue = createAckQueue({
      transport: t.transport,
      policy,
      onStale: vi.fn(),
    })
    queue.offer(ack(1, 10))
    queue.offer(ack(2, 20))
    queue.discard(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(t.sentValues()).toEqual([20])
    queue.offer(ack(2, 21))
    queue.dispose()
    queue.offer(ack(2, 22))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.sentValues()).toEqual([20])
  })
})
