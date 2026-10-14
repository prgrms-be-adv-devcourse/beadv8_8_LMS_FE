type Config = {
  onConnect?: (frame: unknown) => void
  onWebSocketClose?: (event: unknown) => void
}

/**
 * 테스트용 가짜 STOMP 클라이언트(@stomp/stompjs의 Client 대신). 실제 WebSocket을 열지 않는다.
 * 테스트는 connect()로 연결을, push()로 서버가 보낸 메시지를 흉내 내고, published로 보낸 것을 확인한다.
 */
export class FakeStompClient {
  static instances: FakeStompClient[] = []
  connected = false
  active = false
  published: { destination: string; body: string }[] = []
  private subscriptions = new Map<string, (frame: { body: string }) => void>()

  config: Config

  constructor(config: Config) {
    this.config = config
    FakeStompClient.instances.push(this)
  }

  activate() {
    this.active = true
  }

  async deactivate() {
    this.active = false
    this.connected = false
  }

  subscribe(destination: string, callback: (frame: { body: string }) => void) {
    this.subscriptions.set(destination, callback)
    return { unsubscribe: () => this.subscriptions.delete(destination) }
  }

  publish(params: { destination: string; body: string }) {
    this.published.push(params)
  }

  // ── 테스트 도우미 ──
  connect() {
    this.connected = true
    this.config.onConnect?.({})
  }

  disconnect() {
    this.connected = false
    this.config.onWebSocketClose?.({})
  }

  push(destination: string, body: unknown) {
    this.subscriptions.get(destination)?.({ body: JSON.stringify(body) })
  }

  static latest() {
    return FakeStompClient.instances.at(-1)
  }

  static reset() {
    FakeStompClient.instances = []
  }
}
