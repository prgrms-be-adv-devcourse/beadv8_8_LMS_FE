import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReconcileScheduler } from './reconcileScheduler'

const policy = { intervalMs: 1_000, jitterRatio: 0.5, maxConcurrentRooms: 2 }

/** 끝나는 시점을 테스트가 정하는 대조 */
function controlled() {
  const pending: (() => void)[] = []
  const fn = vi.fn(
    (..._args: unknown[]) =>
      new Promise<void>((resolve) => pending.push(resolve)),
  )
  return {
    fn,
    /** 가장 먼저 시작한 진행 중 대조를 끝낸다 */
    finish: async () => {
      pending.shift()?.()
      await vi.advanceTimersByTimeAsync(0)
    },
    inFlight: () => pending.length,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createReconcileScheduler', () => {
  it('주기마다 intervalMs × (1 + jitterRatio × random())를 기다리고, 매번 새로 뽑는다', async () => {
    const random = vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(0)
    const runRooms = vi.fn(async () => {})
    const scheduler = createReconcileScheduler({
      policy,
      rooms: () => [],
      runRooms,
      runRoom: async () => {},
      random,
    })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(1_499)
    expect(runRooms).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(runRooms).toHaveBeenCalledTimes(1)
    // 두 번째 주기는 random() = 0이라 1000ms
    await vi.advanceTimersByTimeAsync(999)
    expect(runRooms).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(runRooms).toHaveBeenCalledTimes(2)
    expect(random).toHaveBeenCalledTimes(3)
    scheduler.stop()
  })

  it('한 주기에 방 목록과 대조 대상 방을 돌리되 방은 동시에 maxConcurrentRooms개까지만 돌린다', async () => {
    const room = controlled()
    const runRooms = vi.fn(async () => {})
    const scheduler = createReconcileScheduler({
      policy,
      rooms: () => [1, 2, 3],
      runRooms,
      runRoom: room.fn,
      random: () => 0,
    })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(runRooms).toHaveBeenCalledTimes(1)
    expect(room.fn.mock.calls.map(([id]) => id)).toEqual([1, 2])
    await room.finish()
    expect(room.fn.mock.calls.map(([id]) => id)).toEqual([1, 2, 3])
    expect(room.inFlight()).toBe(2)
    scheduler.stop()
  })

  it('진행 중인 방을 다시 요청하면 겹쳐 돌리지 않고 끝난 뒤 한 번만 더 돌린다', async () => {
    const room = controlled()
    const rooms = controlled()
    const scheduler = createReconcileScheduler({
      policy,
      rooms: () => [],
      runRooms: rooms.fn,
      runRoom: room.fn,
    })
    scheduler.start()
    scheduler.trigger(7)
    scheduler.trigger(7)
    scheduler.trigger(7)
    expect(rooms.fn).toHaveBeenCalledTimes(1)
    // 방 대조는 방 목록 대조가 끝난 뒤 시작한다.
    expect(room.fn).not.toHaveBeenCalled()
    // 진행 중에 온 방 목록 요청은 하나로 합쳐 끝난 뒤 한 번 더 돌린다. 방 대조는 그 대조까지 끝난 뒤 시작한다
    // (늦게 끝나는 방 목록 응답이 방 대조 뒤의 읽음을 덮지 않게).
    await rooms.finish()
    expect(rooms.fn).toHaveBeenCalledTimes(2)
    expect(room.fn).not.toHaveBeenCalled()
    // 세 요청의 방 대조는 하나로 합쳐 돌고, 진행 중에 겹친 요청으로 끝난 뒤 한 번만 더 돈다.
    await rooms.finish()
    expect(room.fn).toHaveBeenCalledTimes(1)
    await room.finish()
    expect(room.fn).toHaveBeenCalledTimes(2)
    await room.finish()
    expect(room.fn).toHaveBeenCalledTimes(2)
    expect(rooms.fn).toHaveBeenCalledTimes(2)
    scheduler.stop()
  })

  it('trigger(null)은 지금 한 주기를 돌린다', async () => {
    const runRoom = vi.fn(async () => {})
    const runRooms = vi.fn(async () => {})
    const scheduler = createReconcileScheduler({
      policy,
      rooms: () => [4],
      runRooms,
      runRoom,
    })
    scheduler.start()
    scheduler.trigger(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(runRooms).toHaveBeenCalledTimes(1)
    expect(runRoom).toHaveBeenCalledExactlyOnceWith(4)
    scheduler.stop()
  })

  it('방 대조는 방 목록 대조가 끝난 뒤(실패해도) 시작한다', async () => {
    // 대조로 채운 메시지를 읽음 처리한 뒤 읽음 전에 만들어진 방 목록 응답이 안 읽은 수를 되살리지 않게(계약 (e) 순서).
    const order: string[] = []
    let failRooms!: () => void
    const scheduler = createReconcileScheduler({
      policy,
      rooms: () => [4],
      runRooms: () =>
        new Promise<void>((_, reject) => {
          order.push('rooms')
          failRooms = () => reject(new Error('boom'))
        }),
      runRoom: async (id) => {
        order.push(`room ${id}`)
      },
    })
    scheduler.start()
    scheduler.trigger(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['rooms'])
    failRooms()
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['rooms', 'room 4'])
    scheduler.stop()
  })

  it('방 목록 대조 중에 다른 요청이 대조를 더 예약하면 방 대조는 그 대조까지 끝난 뒤 시작한다', async () => {
    const rooms = controlled()
    const runRoom = vi.fn(async () => {})
    const scheduler = createReconcileScheduler({
      policy,
      rooms: () => [],
      runRooms: rooms.fn,
      runRoom,
    })
    scheduler.start()
    scheduler.trigger(4)
    // 첫 방 목록 대조 중에 간격 대조가 방 목록만 다시 요청한다.
    scheduler.triggerRooms()
    await rooms.finish()
    expect(rooms.fn).toHaveBeenCalledTimes(2)
    expect(runRoom).not.toHaveBeenCalled()
    await rooms.finish()
    expect(runRoom).toHaveBeenCalledExactlyOnceWith(4)
    scheduler.stop()
  })

  it('방 목록 요청이 계속 이어져도 방 대조는 합쳐 둔 한 번까지만 기다리고 시작한다(굶지 않는다)', async () => {
    const rooms = controlled()
    const runRoom = vi.fn(async () => {})
    const scheduler = createReconcileScheduler({
      policy,
      rooms: () => [],
      runRooms: rooms.fn,
      runRoom,
    })
    scheduler.start()
    scheduler.trigger(4)
    scheduler.triggerRooms()
    await rooms.finish()
    // 두 번째 방 목록 대조 중에도 요청이 또 온다.
    scheduler.triggerRooms()
    await rooms.finish()
    expect(rooms.fn).toHaveBeenCalledTimes(3)
    expect(runRoom).toHaveBeenCalledExactlyOnceWith(4)
    await rooms.finish()
    scheduler.stop()
  })

  it('멈추기 전에 예약된 방 목록 대조는 다시 시작한 뒤의 요청에 쓰지 않고, 새 방 목록 대조가 끝난 뒤 방을 대조한다', async () => {
    const rooms = controlled()
    const runRoom = vi.fn(async () => {})
    const scheduler = createReconcileScheduler({
      policy,
      rooms: () => [],
      runRooms: rooms.fn,
      runRoom,
    })
    scheduler.start()
    scheduler.trigger(4)
    scheduler.triggerRooms() // 진행 중이라 다시 돌리기로 예약
    // 연결이 끊겼다가 다시 연결됐다.
    scheduler.stop()
    scheduler.start()
    scheduler.trigger(5)
    await rooms.finish() // 끊기기 전의 방 목록 대조가 끝난다
    expect(rooms.fn).toHaveBeenCalledTimes(2)
    expect(runRoom).not.toHaveBeenCalled()
    await rooms.finish()
    expect(runRoom).toHaveBeenCalledExactlyOnceWith(5)
    scheduler.stop()
  })

  it('triggerRooms는 방 목록만 대조한다', async () => {
    const runRoom = vi.fn(async () => {})
    const runRooms = vi.fn(async () => {})
    const scheduler = createReconcileScheduler({
      policy,
      rooms: () => [4],
      runRooms,
      runRoom,
    })
    scheduler.start()
    scheduler.triggerRooms()
    await vi.advanceTimersByTimeAsync(0)
    expect(runRooms).toHaveBeenCalledTimes(1)
    expect(runRoom).not.toHaveBeenCalled()
    scheduler.stop()
  })

  it('방 목록 대조 중에 멈추면 그 뒤의 방 대조와 다시 돌리기를 하지 않는다', async () => {
    const rooms = controlled()
    const runRoom = vi.fn(async () => {})
    const scheduler = createReconcileScheduler({
      policy,
      rooms: () => [4],
      runRooms: rooms.fn,
      runRoom,
    })
    scheduler.start()
    scheduler.trigger(null)
    scheduler.trigger(4) // 진행 중이라 끝난 뒤 다시 돌리기로 예약
    scheduler.stop()
    await rooms.finish()
    expect(runRoom).not.toHaveBeenCalled()
    expect(rooms.fn).toHaveBeenCalledTimes(1)
    expect(rooms.inFlight()).toBe(0)
  })

  it('대조가 실패해도(동기 예외 포함) 다음 주기는 그대로 돈다', async () => {
    const runRoom = vi.fn(() => {
      throw new Error('boom')
    })
    const runRooms = vi.fn(async () => {
      throw new Error('boom')
    })
    const scheduler = createReconcileScheduler({
      policy,
      rooms: () => [1],
      runRooms,
      runRoom,
      random: () => 0,
    })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(runRooms).toHaveBeenCalledTimes(3)
    expect(runRoom).toHaveBeenCalledTimes(3)
    scheduler.stop()
  })

  it('stop 뒤에는 타이머·trigger·대기 중 방·다시 돌리기 모두 멈춘다', async () => {
    const room = controlled()
    const runRooms = vi.fn(async () => {})
    const scheduler = createReconcileScheduler({
      policy,
      rooms: () => [1, 2, 3],
      runRooms,
      runRoom: room.fn,
      random: () => 0,
    })
    scheduler.start()
    scheduler.trigger(null)
    await vi.advanceTimersByTimeAsync(0)
    scheduler.trigger(1) // 진행 중이라 다시 돌리기로 표시
    await vi.advanceTimersByTimeAsync(0)
    expect(room.fn).toHaveBeenCalledTimes(2)
    expect(runRooms).toHaveBeenCalledTimes(2)
    scheduler.stop()
    await room.finish()
    await room.finish()
    scheduler.trigger(null)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(room.fn).toHaveBeenCalledTimes(2)
    expect(runRooms).toHaveBeenCalledTimes(2)
  })

  it('시작 전 trigger는 무시한다', () => {
    const runRooms = vi.fn(async () => {})
    const scheduler = createReconcileScheduler({
      policy,
      rooms: () => [1],
      runRooms,
      runRoom: async () => {},
    })
    scheduler.trigger(null)
    expect(runRooms).not.toHaveBeenCalled()
  })
})
