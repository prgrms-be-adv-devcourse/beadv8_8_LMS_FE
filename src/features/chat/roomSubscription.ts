import {
  CHAT_FRAME_TYPE_HEADER,
  PARTICIPATION_VERSION_HEADER,
  roomTopic,
  SUBSCRIPTION_REASONS,
  SUBSCRIPTION_REJECTED,
  SUBSCRIPTION_REVOKED,
  type SubscriptionEnd,
} from './receipt/contract'
import { RECEIPT_POLICY } from './receipt/policy'

export type TopicFrame = { body: string; headers: Record<string, string> }

/** 방 topic을 구독할 STOMP 클라이언트(@stomp/stompjs Client의 일부) */
export type TopicClient = {
  subscribe: (
    destination: string,
    callback: (frame: TopicFrame) => void,
    headers?: Record<string, string>,
  ) => { unsubscribe: () => void }
}

type Options = {
  /** 구독할 방(열어 둔 방). 없으면 null */
  target: () => number | null
  /** 구독 헤더에 넣을 내 참여 세대. 모르거나 구독하면 안 되면(참여 중이 아님) undefined */
  generationOf: (chatRoomId: number) => number | undefined
  /** 방 topic으로 온 메시지 프레임 */
  onMessage: (frame: TopicFrame) => void
  /** 구독이 거절·회수됐다. 방 목록과 그 방 이력을 다시 맞춘다 */
  onLost: (chatRoomId: number) => void
  /** 서버가 알려 준 내 현재 세대(구독 세대가 낡았을 때) */
  onGeneration: (chatRoomId: number, version: number) => void
  /** 모르는 프레임 종류·사유. 재동기화한다 */
  onUnknown: () => void
  /** 서버가 바빠 거절했을 때 한 번 다시 구독하기까지 기다리는 시간 */
  busyRetryMs?: number
}

type Active = {
  chatRoomId: number
  version: number
  handle: { unsubscribe: () => void }
}

/**
 * 열어 둔 방 하나의 방 topic 구독을 맞춘다. sync()를 부를 때마다 열어 둔 방·참여 세대와 지금 구독을 비교해
 * 다르면 이전 구독을 풀고 새로 구독한다(세대가 바뀌면 새 세대로 다시 구독). 다시 구독할 때마다 새 구독 ID를 쓰므로,
 * 풀거나 회수된 구독으로 늦게 온 프레임은 적용하지 않는다.
 * 서버가 거절·회수한 (방, 세대)는 같은 연결에서 다시 구독하지 않는다(세대가 바뀌거나 다시 연결하면 구독한다).
 * 서버가 바빠 거절하면(SERVER_BUSY) 그동안은 새 메시지 알림과 이력으로 쓰고, 잠시 뒤 한 번만 다시 구독한다.
 */
export function createRoomSubscription(options: Options) {
  let client: TopicClient | null = null
  let active: Active | null = null
  /** 거절·회수된 방·세대("방:세대") */
  const ended = new Set<string>()
  /** 바빠서 거절된 뒤 다시 구독을 예약했던 방·세대(한 연결에서 한 번만) */
  const busyRetried = new Set<string>()
  const busyTimers = new Set<ReturnType<typeof setTimeout>>()
  const { busyRetryMs = RECEIPT_POLICY.subscription.busyRetryMs } = options

  const clearBusyTimers = () => {
    for (const timer of busyTimers) clearTimeout(timer)
    busyTimers.clear()
  }

  const release = () => {
    active?.handle.unsubscribe()
    active = null
  }

  const end = (entry: Active, body: SubscriptionEnd) => {
    // 서버가 이미 지웠어도(회수) 풀어 둔다. 서버는 모르는 구독 ID의 해제를 무시한다.
    if (active === entry) release()
    const key = `${entry.chatRoomId}:${entry.version}`
    ended.add(key)
    if (!SUBSCRIPTION_REASONS.has(body.reason)) {
      options.onUnknown()
      return
    }
    if (body.reason === 'SERVER_BUSY') {
      if (busyRetried.has(key)) return
      busyRetried.add(key)
      const timer = setTimeout(() => {
        busyTimers.delete(timer)
        ended.delete(key)
        sync()
      }, busyRetryMs)
      busyTimers.add(timer)
      return
    }
    const current = body.currentParticipationVersion
    if (
      body.reason === 'STALE_PARTICIPATION' &&
      Number.isInteger(current) &&
      current! > entry.version
    ) {
      // 새 세대를 알리면 이전 세대 상태를 버리고 방 목록을 다시 받는다. 새 세대로 바로 다시 구독한다.
      options.onGeneration(entry.chatRoomId, current!)
      sync()
      return
    }
    options.onLost(entry.chatRoomId)
  }

  const subscribe = (chatRoomId: number, version: number) => {
    const entry: Active = {
      chatRoomId,
      version,
      handle: { unsubscribe: () => {} },
    }
    active = entry
    entry.handle = client!.subscribe(
      roomTopic(chatRoomId),
      (frame) => {
        // 풀었거나 다른 구독으로 바뀐 뒤 늦게 온 프레임
        if (active !== entry) return
        const type = frame.headers[CHAT_FRAME_TYPE_HEADER]
        if (!type || type === 'MESSAGE') options.onMessage(frame)
        else if (
          type === SUBSCRIPTION_REJECTED ||
          type === SUBSCRIPTION_REVOKED
        )
          end(entry, JSON.parse(frame.body) as SubscriptionEnd)
        else options.onUnknown()
      },
      { [PARTICIPATION_VERSION_HEADER]: String(version) },
    )
  }

  function sync() {
    if (!client) return
    const chatRoomId = options.target()
    const version =
      chatRoomId === null ? undefined : options.generationOf(chatRoomId)
    if (
      active &&
      (active.chatRoomId !== chatRoomId || active.version !== version)
    )
      release()
    if (chatRoomId === null || version === undefined || active) return
    if (ended.has(`${chatRoomId}:${version}`)) return
    subscribe(chatRoomId, version)
  }

  return {
    sync,
    /** 연결됐다(재연결 포함). 새 세션이므로 이전 거절 기록을 버리고 열어 둔 방을 구독한다 */
    connected(next: TopicClient) {
      client = next
      active = null
      ended.clear()
      busyRetried.clear()
      clearBusyTimers()
      sync()
    },
    /** 연결이 끊겼다. 구독은 연결과 함께 사라지므로 해제 프레임을 보내지 않는다 */
    disconnected() {
      client = null
      active = null
      clearBusyTimers()
    },
    /** 지금 구독 중인 방(테스트·진단용) */
    current: () => active?.chatRoomId ?? null,
  }
}
