type Config = {
  brokerURL?: string
  beforeConnect?: (client: FakeStompClient) => void | Promise<void>
  onConnect?: (frame: unknown) => void
  onWebSocketClose?: (event: unknown) => void
}

type Frame = { body: string; headers: Record<string, string> }

/** 구독 하나. 실제 클라이언트처럼 구독마다 새 ID를 쓴다 */
export type FakeSubscription = {
  id: string
  destination: string
  /** SUBSCRIBE 헤더(예: 방 topic의 참여 세대) */
  headers: Record<string, string>
  /** 해제했는지(해제 프레임을 보냈는지) */
  unsubscribed: boolean
  callback: (frame: Frame) => void
}

/**
 * 테스트용 가짜 STOMP 클라이언트(@stomp/stompjs의 Client 대신). 실제 WebSocket을 열지 않는다.
 * 테스트는 connect()로 연결을, push()로 서버가 보낸 메시지를 흉내 내고, published로 보낸 것을 확인한다.
 * 구독은 subscriptions에 남고, 연결이 끊기면(실제 클라이언트처럼) 살아 있는 구독이 모두 사라진다.
 */
export class FakeStompClient {
  static instances: FakeStompClient[] = []
  connected = false
  active = false
  /** 보낸 프레임(본문이 없는 프레임은 빈 문자열) */
  published: {
    destination: string
    body: string
    headers?: Record<string, string>
  }[] = []
  /** 연결 주소(beforeConnect가 일회용 티켓을 붙인다) */
  brokerURL?: string
  /** CONNECT 헤더(beforeConnect가 넣는 access token 등) */
  connectHeaders: Record<string, string> = {}
  /** 마지막 activate()의 beforeConnect가 끝나면 풀린다. CONNECT 헤더를 확인하기 전에 기다린다 */
  ready: Promise<void> = Promise.resolve()
  /** 이 클라이언트가 한 모든 구독(해제·끊긴 것 포함, 구독한 순) */
  subscriptions: FakeSubscription[] = []
  /** 지금 살아 있는 구독 */
  private live = new Set<FakeSubscription>()
  private nextId = 0

  config: Config

  constructor(config: Config) {
    this.config = config
    this.brokerURL = config.brokerURL
    FakeStompClient.instances.push(this)
  }

  /** 실제 클라이언트처럼 연결 전에 beforeConnect를 부른다. 연결은 테스트가 connect()로 맺는다 */
  activate() {
    this.active = true
    this.ready = Promise.resolve(this.config.beforeConnect?.(this))
  }

  /** 실제 클라이언트처럼 해제하면 구독도 끝나 이후 프레임을 받지 않는다 */
  async deactivate() {
    this.active = false
    this.connected = false
    this.live.clear()
  }

  subscribe(
    destination: string,
    callback: (frame: Frame) => void,
    headers: Record<string, string> = {},
  ) {
    const subscription: FakeSubscription = {
      id: `sub-${this.nextId++}`,
      destination,
      headers,
      unsubscribed: false,
      callback,
    }
    this.subscriptions.push(subscription)
    this.live.add(subscription)
    return {
      unsubscribe: () => {
        subscription.unsubscribed = true
        this.live.delete(subscription)
      },
    }
  }

  /** 지금 살아 있는 이 목적지의 구독 */
  liveOn(destination: string) {
    return [...this.live].filter((s) => s.destination === destination)
  }

  publish(params: {
    destination: string
    body?: string
    headers?: Record<string, string>
  }) {
    this.published.push({ ...params, body: params.body ?? '' })
  }

  // ── 테스트 도우미 ──
  connect() {
    this.connected = true
    this.config.onConnect?.({})
  }

  /** 소켓이 닫힌다. event는 닫힘 코드·사유(예: 서버가 수신 상한 초과로 닫은 4500) */
  disconnect(event: { code?: number; reason?: string } = {}) {
    this.connected = false
    this.live.clear()
    this.config.onWebSocketClose?.(event)
  }

  /**
   * 서버가 보낸 프레임. headers는 STOMP 수신 메타데이터(예: 수신자 참여 세대, 방 topic 프레임 종류).
   * 그 목적지의 살아 있는 구독마다 전한다
   */
  push(
    destination: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) {
    for (const subscription of this.liveOn(destination))
      subscription.callback({ body: JSON.stringify(body), headers })
  }

  /** 서버가 특정 구독으로 보낸 프레임(해제·끊긴 구독이면 실제 클라이언트처럼 버린다) */
  pushTo(
    subscription: FakeSubscription,
    body: unknown,
    headers: Record<string, string> = {},
  ) {
    if (this.live.has(subscription))
      subscription.callback({ body: JSON.stringify(body), headers })
  }

  static latest() {
    return FakeStompClient.instances.at(-1)
  }

  static reset() {
    FakeStompClient.instances = []
  }
}
