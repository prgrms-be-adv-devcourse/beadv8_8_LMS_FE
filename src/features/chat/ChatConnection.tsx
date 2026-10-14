import { Client } from '@stomp/stompjs'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { chatKeys } from '@/entities/chat/api'
import { API_BASE } from '@/shared/api/client'
import { failAllSending, useChatStore } from './chatStore'
import { applyChatError, applyIncomingMessage } from './incoming'

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
 * 방 단위 topic은 없고 회원별 큐로만 받는다. 재연결되면 끊긴 동안 놓친 메시지를 채우려고 채팅 데이터를 다시 부른다.
 * userId가 바뀌면(로그아웃·역할 전환) 연결을 새로 맺는다.
 */
export function ChatConnection({ userId }: { userId: number }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    let connectedOnce = false
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
        if (connectedOnce)
          void queryClient.invalidateQueries({ queryKey: chatKeys.all })
        connectedOnce = true
        useChatStore.setState({ status: 'connected' })
      },
      onWebSocketClose: () => {
        useChatStore.setState({ status: 'disconnected' })
        failAllSending()
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
