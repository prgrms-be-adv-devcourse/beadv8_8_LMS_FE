import { Client } from '@stomp/stompjs'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { chatKeys } from '@/entities/chat/api'
import { API_BASE } from '@/shared/api/client'
import { meQuery } from '@/shared/auth/me'
import { clearSession } from '@/shared/auth/session'
import { openLoginModal } from '@/shared/ui/loginModal'
import { failAllSending, useChatStore } from './chatStore'
import {
  applyChatError,
  applyIncomingMessage,
  watchChatLoads,
} from './incoming'

// 새 메시지 알림(/user/queue/chats/notifications)은 받는 사람에게 메시지 큐로도 같은 메시지가 오므로 구독하지 않는다.
// 안 읽은 수·마지막 메시지는 메시지 큐로 받은 메시지에서 고친다.
const QUEUE = {
  messages: '/user/queue/chats/messages',
  errors: '/user/queue/chats/errors',
}

function brokerUrl() {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${location.host}${API_BASE}/chats/ws`
}

/**
 * 앱 전체에서 STOMP 연결 하나를 유지한다(세션 쿠키로 인증). 화면에는 아무것도 그리지 않는다.
 * 방 단위 topic은 없고 회원별 큐로만 받는다. 연결될 때마다(최초 연결 포함) 구독 전에 놓친 메시지를 채우려고
 * 채팅 데이터를 다시 부른다.
 * userId가 바뀌면(로그아웃·역할 전환) 연결을 새로 맺는다.
 * 연결이 끊기면 세션이 살아 있는지 한 번 확인한다. 세션이 없으면(로그아웃·만료, BE가 소켓을 닫은 경우)
 * 비회원으로 바꿔 이 컴포넌트가 사라지게 하고, 거절될 재연결을 반복하지 않는다.
 */
export function ChatConnection({ userId }: { userId: number }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const stopWatchingLoads = watchChatLoads(queryClient)
    // 끊긴 뒤 세션을 확인했는지. 다시 연결되면 초기화한다(BE가 응답하지 않는 동안 재시도마다 확인하지 않게).
    let sessionChecked = false

    const checkSession = async () => {
      const me = await queryClient
        .fetchQuery({ ...meQuery, staleTime: 0 })
        .catch(() => undefined)
      if (me !== null) return
      // 로그아웃과 같이 이전 회원 데이터를 지운다(새로고침 없이 다른 계정으로 로그인해도 남지 않게).
      clearSession(queryClient)
      openLoginModal('로그인이 끊겼어요. 다시 로그인해 주세요.')
    }
    const client = new Client({
      brokerURL: brokerUrl(),
      reconnectDelay: 3000,
      onConnect: () => {
        client.subscribe(QUEUE.messages, (frame) =>
          applyIncomingMessage(queryClient, JSON.parse(frame.body)),
        )
        client.subscribe(QUEUE.errors, (frame) =>
          applyChatError(queryClient, JSON.parse(frame.body)),
        )
        // 구독 전에 불러온 이력에는 구독 전까지 온 메시지가 빠져 있을 수 있다(최초 연결 전에 연 방,
        // 끊긴 동안 온 메시지). 구독한 뒤 다시 불러와 사이 구간을 메운다. 불러오는 중에 온 메시지는
        // applyIncomingMessage가 보관했다가 합친다.
        void queryClient.invalidateQueries({ queryKey: chatKeys.all })
        sessionChecked = false
        useChatStore.setState({ status: 'connected' })
      },
      onWebSocketClose: () => {
        useChatStore.setState({ status: 'disconnected' })
        failAllSending()
        // 직접 닫은 경우(deactivate)는 확인하지 않는다.
        if (client.active && !sessionChecked) {
          sessionChecked = true
          void checkSession()
        }
      },
      onStompError: () => useChatStore.setState({ status: 'disconnected' }),
    })

    useChatStore.setState({
      status: 'connecting',
      myUserId: userId,
      publish: (chatRoomId, content, clientMessageId) => {
        if (!client.connected) return false
        client.publish({
          destination: `/pub/chats/${chatRoomId}/messages`,
          body: JSON.stringify({ content, clientMessageId }),
        })
        return true
      },
    })
    client.activate()

    return () => {
      void client.deactivate()
      stopWatchingLoads()
      useChatStore.setState({
        status: 'idle',
        publish: () => false,
        viewingRoomId: null,
        myUserId: null,
        pending: {},
      })
    }
  }, [queryClient, userId])

  return null
}
