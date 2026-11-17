import { Client, ReconnectionTimeMode } from '@stomp/stompjs'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { notificationKeys } from '@/entities/notification/api'
import { RECONNECT, ticketRetryDelay } from '@/features/chat/connectionAuth'
import { API_BASE } from '@/shared/api/client'
import { clearSession } from '@/shared/auth/session'
import { openLoginModal } from '@/shared/ui/loginModal'
import { requestNotificationTicket } from './connectionTicket'
import { applyNotificationFrame, isNotificationFrame } from './incoming'

/** 내 알림을 받는 곳. 이 연결은 이것만 구독하고 아무것도 보내지 않는다(다른 구독·SEND는 서버가 닫는다) */
export const NOTIFICATION_QUEUE = '/user/queue/notifications'

/**
 * heart-beat 보내기·받기 간격(ms). 둘 다 0이 아니어야 한다(BE ND-068). 받기가 0이면 서버도 보내지 않아 알림이 없을 때
 * Gateway idle(5분)에 끊긴다. 서버는 25초라 협상하면 25초가 된다. 클라이언트 heart-beat가 75초 없으면 서버가 닫는다.
 */
export const NOTIFICATION_HEARTBEAT_MS = 10_000

/** 연결 주소. 브라우저 WebSocket은 헤더를 실을 수 없어 일회용 티켓을 쿼리로 보낸다 */
function brokerUrl(ticket?: string) {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  const url = `${scheme}://${location.host}${API_BASE}/notifications/ws`
  return ticket ? `${url}?ticket=${encodeURIComponent(ticket)}` : url
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 알림센터 실시간 연결(BE auxiliary-app notification 자체 STOMP, 채팅 연결과 별개). 화면에는 아무것도 그리지 않는다.
 * 새 알림 프레임으로 목록 맨 앞과 안 읽은 수(헤더 배지)를 바로 바꾼다(incoming.ts).
 * - 연결·재연결마다 일회용 티켓을 받아 주소에 싣는다(CONNECT에는 토큰을 넣지 않는다, connectionTicket.ts)
 * - 실시간 전달은 유실될 수 있어 연결될 때마다(최초 연결 포함) 목록과 안 읽은 수를 다시 읽는다
 * - 같은 연결의 재인증은 없다. 서버는 연결 만료(connectionExpiresAt)에 4401로 닫고, 그 밖의 비정상 종료·핸드셰이크
 *   거절(티켓 401, 브라우저에는 1006으로 보인다)과 같이 채팅과 같은 간격으로 새 티켓을 받아 다시 연결한다. 4401이면
 *   토큰이 거의 끝났으므로 새 티켓을 받기 전에 토큰부터 다시 받는다
 * userId가 바뀌면(로그아웃·회원 전환) 연결을 새로 맺고, 회원이 아니게 되면(로그아웃, 다른 탭 로그아웃 포함) 이 컴포넌트가
 * 사라지며 연결을 닫는다.
 */
export function NotificationConnection({ userId }: { userId: number }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    // 처음 연결 시도는 바로, 그 뒤의 시도(최초 연결 실패 뒤 재시도 포함)는 무작위로 조금 기다린다.
    let attempted = false
    // 이 연결을 정리했는지(로그아웃·회원 전환·화면 해제)
    let disposed = false

    const client = new Client({
      brokerURL: brokerUrl(),
      reconnectDelay: RECONNECT.baseMs,
      reconnectTimeMode: ReconnectionTimeMode.EXPONENTIAL,
      maxReconnectDelay: RECONNECT.maxMs,
      heartbeatIncoming: NOTIFICATION_HEARTBEAT_MS,
      heartbeatOutgoing: NOTIFICATION_HEARTBEAT_MS,
      // 연결·재연결마다 새 티켓을 받아 주소에 싣는다(티켓은 한 번만 쓴다).
      // - 토큰을 다시 받지 못하면(다시 로그인해야 함) 연결하지 않고 비회원으로 바꾼다
      // - 알림을 받지 않는 회원(403)이면 연결하지 않는다
      // - 횟수 제한(429)·티켓 저장소 장애(503)·응답 없음이면 재연결과 같은 간격으로 다시 받는다(소켓을 열지 않아
      //   stompjs가 다시 시도하지 않으므로 여기서 기다린다)
      beforeConnect: async () => {
        if (attempted) await sleep(Math.random() * RECONNECT.jitterMs)
        attempted = true
        for (let failures = 0; ; failures++) {
          if (disposed || !client.active) return
          const result = await requestNotificationTicket()
          if (disposed) return
          if (result.ok) {
            client.brokerURL = brokerUrl(result.ticket.ticket)
            client.connectHeaders = {}
            return
          }
          if (result.reason === 'signedOut') {
            void client.deactivate()
            clearSession(queryClient)
            openLoginModal('로그인이 끊겼어요. 다시 로그인해 주세요.')
            return
          }
          if (result.reason === 'forbidden') {
            void client.deactivate()
            return
          }
          await sleep(ticketRetryDelay(failures))
        }
      },
      onConnect: () => {
        client.subscribe(NOTIFICATION_QUEUE, (frame) => {
          // 연결을 정리한 뒤 늦게 온 프레임은 무시한다(다른 회원의 캐시를 건드리지 않게).
          if (disposed) return
          let body: unknown
          try {
            body = JSON.parse(frame.body)
          } catch {
            return
          }
          if (isNotificationFrame(body))
            applyNotificationFrame(queryClient, body)
        })
        // 구독 전(끊긴 동안 포함)에 온 알림은 프레임으로 오지 않는다. 구독한 뒤 다시 읽어 맞춘다.
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all })
      },
    })
    client.activate()

    return () => {
      disposed = true
      void client.deactivate()
    }
  }, [queryClient, userId])

  return null
}
