import { Client, ReconnectionTimeMode } from '@stomp/stompjs'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { chatKeys, myMembershipIn, observeChatPages } from '@/entities/chat/api'
import type { ChatRoom } from '@/entities/chat/types'
import { API_BASE } from '@/shared/api/client'
import { clearSession } from '@/shared/auth/session'
import { refreshAccessToken } from '@/shared/auth/token'
import { openLoginModal } from '@/shared/ui/loginModal'
import { failAllSending, useChatStore } from './chatStore'
import {
  createReauth,
  RECONNECT,
  requestTicket,
  ticketRetryDelay,
} from './connectionAuth'
import {
  applyChatError,
  applyIncomingMessage,
  applyRoomActivity,
  watchChatLoads,
} from './incoming'
import {
  isResyncSignal,
  isRoomActivity,
  NOTIFICATIONS_QUEUE,
  readDeliveryMeta,
  receiptTransports,
  SYNC_QUEUE,
} from './receipt/contract'
import { createReceiptService } from './receipt/receiptService'
import { createRoomSubscription } from './roomSubscription'
import { listenRoomChanges } from './roomSync'
import { installSendConfirm } from './sendConfirm'

// 열어 둔 방의 새 메시지는 방 topic(roomSubscription)으로 받는다. 그 밖의 방은 새 메시지 알림 묶음으로 방 목록의
// 마지막 메시지·안 읽은 수(추정치)를 고치고, 방을 열 때·방 목록을 다시 받을 때 서버 값으로 맞춘다.
const QUEUE = {
  /** 내가 보낸 메시지의 결과(내 모든 세션) */
  messages: '/user/queue/chats/messages',
  /** 방 topic을 구독하지 않은 방의 새 메시지 알림(ROOM_ACTIVITY) */
  notifications: NOTIFICATIONS_QUEUE,
  errors: '/user/queue/chats/errors',
  /** 재동기화 신호: 서버의 실시간 구독이 끊겼다 복구됐다 */
  sync: SYNC_QUEUE,
  /** 재인증 결과(이 연결에만 온다) */
  connection: '/user/queue/chats/connection',
}

/** 재인증 프레임을 보내는 곳(헤더 ticket, 본문 없음) */
const REAUTH_DESTINATION = '/pub/chats/reauth'

/** 연결 주소. 브라우저 WebSocket은 헤더를 실을 수 없어 일회용 티켓을 쿼리로 보낸다 */
function brokerUrl(ticket?: string) {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  const url = `${scheme}://${location.host}${API_BASE}/chats/ws`
  return ticket ? `${url}?ticket=${encodeURIComponent(ticket)}` : url
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 앱 전체에서 STOMP 연결 하나를 유지한다. 연결마다 일회용 티켓을 받아 주소에 싣고(CONNECT에는 토큰을 넣지 않는다),
 * 연결 만료 전에 같은 연결로 재인증한다(connectionAuth.ts). 화면에는 아무것도 그리지 않는다.
 * 열어 둔 방은 방 topic으로, 그 밖의 방은 새 메시지 알림으로 받는다. 연결될 때마다(최초 연결 포함) 구독 전에 놓친
 * 메시지를 채우려고 채팅 데이터를 다시 부른다.
 * userId가 바뀌면(로그아웃·역할 전환) 연결을 새로 맺는다.
 * 연결이 끊기면 토큰을 다시 받을 수 있는지 한 번 확인한다. 받지 못하면(로그아웃·만료, BE가 소켓을 닫은 경우)
 * 비회원으로 바꿔 이 컴포넌트가 사라지게 하고, 거절될 재연결을 반복하지 않는다.
 */
export function ChatConnection({ userId }: { userId: number }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    // 순번 간격이 유예 뒤에도 비어 있으면 대조에 맡긴다(서버는 프레임 순서를 보장하지 않는다).
    const stopWatchingLoads = watchChatLoads(queryClient, (chatRoomId) =>
      receipt.reconcileGap(chatRoomId),
    )
    // 다른 탭의 나가기·다시 시작을 듣는다(이 방의 이전 참여 상태를 버린다).
    const stopRoomSync = listenRoomChanges(queryClient)
    // 수신 확인(ACK)·마지막 유실 대조. 경로·형식은 BE와 합의한 계약 (d)·(e)를 따른다(receipt/contract.ts).
    const receipt = createReceiptService({
      queryClient,
      userId,
      transport: receiptTransports.ack,
      openRooms: () => {
        const viewing = useChatStore.getState().viewingRoomId
        return viewing === null ? [] : [viewing]
      },
    })
    const stopObservingPages = observeChatPages(receipt.observePage)
    // 열어 둔 방의 방 topic 구독. 방 목록에 없거나 나간 방은 구독하지 않는다(서버가 거절한다).
    const topics = createRoomSubscription({
      target: () => useChatStore.getState().viewingRoomId,
      generationOf: (chatRoomId) => {
        const rooms = queryClient.getQueryData<ChatRoom[]>(chatKeys.rooms())
        const me = myMembershipIn(
          rooms?.find((r) => r.chatRoomId === chatRoomId),
          userId,
        )
        if (rooms && !me?.active) return undefined
        return receipt.generationOf(chatRoomId)
      },
      onMessage: (frame) => {
        if (disposed) return
        const message = JSON.parse(frame.body)
        const meta = readDeliveryMeta(frame.headers)
        if (!receipt.acceptsRealtime(message, meta)) return
        if (applyIncomingMessage(queryClient, message, 'room'))
          receipt.recordRealtime(message, meta)
      },
      onLost: (chatRoomId) => receipt.reconcileGap(chatRoomId),
      onGeneration: (chatRoomId, version) =>
        receipt.noticeGeneration(chatRoomId, version),
      onUnknown: () => receipt.resync(),
    })
    // 연 방이 바뀌거나 방 목록·이력으로 참여 세대를 새로 알면 구독을 다시 맞춘다.
    const stopWatchingViewing = useChatStore.subscribe((state, prev) => {
      if (state.viewingRoomId !== prev.viewingRoomId) topics.sync()
    })
    const stopWatchingGenerations = queryClient
      .getQueryCache()
      .subscribe((event) => {
        if (
          event.type === 'updated' &&
          event.query.queryKey[0] === chatKeys.all[0]
        )
          topics.sync()
      })
    // 보낸 메시지의 서버 응답이 늦으면 이력에서 확인하고, 없으면 결과 미확인으로 둔다.
    const stopSendConfirm = installSendConfirm(queryClient, {
      generationOf: receipt.generationOf,
      noticeGeneration: receipt.noticeGeneration,
    })
    // 처음 연결 시도는 바로, 그 뒤의 시도(최초 연결 실패 뒤 재시도 포함)는 무작위로 조금 기다린다.
    let attempted = false
    // 이 연결을 정리했는지(로그아웃·회원 전환·화면 해제)
    let disposed = false
    // 끊긴 뒤 로그인 상태를 확인했는지. 다시 연결되면 초기화한다(BE가 응답하지 않는 동안 재시도마다 확인하지 않게).
    let sessionChecked = false

    // 다시 로그인해야 한다. 로그아웃과 같이 이전 회원 데이터를 지운다(새로고침 없이 다른 계정으로 로그인해도 남지 않게).
    const endSession = () => {
      clearSession(queryClient)
      openLoginModal('로그인이 끊겼어요. 다시 로그인해 주세요.')
    }
    // 토큰을 다시 받아 본다. 받지 못하면(다시 로그인해야 함) 비회원으로 바꾼다. BE가 응답하지 않으면 그대로 둔다.
    const checkSession = async () => {
      const token = await refreshAccessToken().catch(() => undefined)
      if (token === null) endSession()
    }
    // 이번 연결에 쓴 티켓의 연결 만료. 연결되면 이 시각 60초 전에 재인증한다.
    let connectionExpiresAt: string | null = null
    const reauth = createReauth({
      send: (ticket) => {
        if (!client.connected) return false
        client.publish({ destination: REAUTH_DESTINATION, headers: { ticket } })
        return true
      },
      onSignedOut: () => {
        void client.deactivate()
        endSession()
      },
    })
    const client = new Client({
      brokerURL: brokerUrl(),
      reconnectDelay: RECONNECT.baseMs,
      reconnectTimeMode: ReconnectionTimeMode.EXPONENTIAL,
      maxReconnectDelay: RECONNECT.maxMs,
      // 연결·재연결마다 새 티켓을 받아 주소에 싣는다(티켓은 한 번만 쓴다). 토큰이 곧 만료되면 먼저 다시 받는다.
      // - 토큰을 다시 받지 못하면(다시 로그인해야 함) 연결하지 않고 비회원으로 바꾼다
      // - 채팅을 쓸 수 없는 회원(403)이면 연결하지 않는다
      // - 횟수 제한(429)·서버 장애(503)·응답 없음이면 재연결과 같은 간격으로 다시 받는다(소켓을 열지 않아
      //   stompjs가 다시 시도하지 않으므로 여기서 기다린다)
      beforeConnect: async () => {
        if (attempted) await sleep(Math.random() * RECONNECT.jitterMs)
        attempted = true
        for (let failures = 0; ; failures++) {
          if (disposed || !client.active) return
          const result = await requestTicket()
          if (disposed) return
          if (result.ok) {
            client.brokerURL = brokerUrl(result.ticket.ticket)
            client.connectHeaders = {}
            connectionExpiresAt = result.ticket.connectionExpiresAt
            return
          }
          if (result.reason === 'signedOut') {
            void client.deactivate()
            endSession()
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
        client.subscribe(QUEUE.messages, (frame) => {
          // 연결을 정리한 뒤 늦게 온 프레임은 무시한다(다음 연결의 중복 제거·확인 상태를 건드리지 않게).
          if (disposed) return
          const message = JSON.parse(frame.body)
          // 현재 참여 세대와 맞지 않는 실시간 응답은 적용하지 않는다.
          const meta = readDeliveryMeta(frame.headers)
          if (!receipt.acceptsRealtime(message, meta)) return
          if (applyIncomingMessage(queryClient, message, 'mine'))
            receipt.recordRealtime(message, meta)
        })
        client.subscribe(QUEUE.notifications, (frame) => {
          if (disposed) return
          const activity = JSON.parse(frame.body)
          if (!isRoomActivity(activity)) return
          // 세대는 본문의 참여 세대로 맞춘다. 알림은 메시지 전체가 아니므로 수신 확인 위치로 기록하지 않는다.
          const meta = { participationVersion: activity.participationVersion }
          const last = {
            ...activity.lastMessage,
            chatRoomId: activity.chatRoomId,
          }
          if (!receipt.acceptsRealtime(last, meta)) return
          applyRoomActivity(queryClient, activity)
          // 열어 둔 방인데 알림이 왔다면 이 세션은 아직 그 방 topic을 받지 못하고 있다(구독 전·거절). 이력을 다시 맞춘다.
          if (activity.chatRoomId === useChatStore.getState().viewingRoomId)
            receipt.reconcileGap(activity.chatRoomId)
        })
        client.subscribe(QUEUE.errors, (frame) => {
          if (!disposed) applyChatError(queryClient, JSON.parse(frame.body))
        })
        // 모르는 사유도 재동기화로 처리한다. 신호가 유실될 수 있어 주기 대조는 그대로 돈다.
        client.subscribe(QUEUE.sync, (frame) => {
          if (!disposed && isResyncSignal(JSON.parse(frame.body)))
            receipt.resync()
        })
        client.subscribe(QUEUE.connection, (frame) => {
          if (!disposed) reauth.handle(JSON.parse(frame.body))
        })
        reauth.start(connectionExpiresAt)
        // 구독 전에 불러온 이력에는 구독 전까지 온 메시지가 빠져 있을 수 있다(최초 연결 전에 연 방,
        // 끊긴 동안 온 메시지). 구독한 뒤 다시 불러와 사이 구간을 메운다. 불러오는 중에 온 메시지는
        // applyIncomingMessage가 보관했다가 합친다.
        void queryClient.invalidateQueries({ queryKey: chatKeys.all })
        sessionChecked = false
        // 연결된 동안 주기적으로 대조한다(연결은 유지된 채 마지막 메시지만 유실된 경우). 연결 직후에도 한 번.
        receipt.start()
        receipt.reconnected()
        topics.connected(client)
        useChatStore.setState({ status: 'connected' })
      },
      // 서버가 닫는 경우: 연결 만료(4401 TOKEN_EXPIRED, 재인증하지 못함)·인증 실패(STOMP ERROR UNAUTHENTICATED 뒤
      // 1002)·다른 기기 로그아웃(1008 LOGGED_OUT)은 토큰을 다시 받아 보고, 받으면 새 티켓으로 다시 연결하고(연결되면
      // 이력을 다시 맞춘다) 받지 못하면 비회원으로 바꾼다. 핸드셰이크 거절(티켓 401)은 브라우저에 1006으로만 보여 같은
      // 길로 새 티켓을 받아 다시 연결한다. 채팅 불가(1008 CHAT_NOT_ALLOWED)는 다시 연결하지 않는다.
      onWebSocketClose: (event: { code?: number; reason?: string }) => {
        useChatStore.setState({ status: 'disconnected' })
        reauth.stop()
        receipt.stop()
        topics.disconnected()
        failAllSending()
        if (event.code === 1008 && event.reason === 'CHAT_NOT_ALLOWED') {
          void client.deactivate()
          return
        }
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
      generationOf: receipt.generationOf,
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
      disposed = true
      // 로그아웃·회원 전환: 재인증 타이머를 멈추고 연결을 끊는다.
      reauth.stop()
      topics.disconnected()
      stopWatchingViewing()
      stopWatchingGenerations()
      void client.deactivate()
      stopWatchingLoads()
      stopRoomSync()
      stopObservingPages()
      stopSendConfirm()
      receipt.dispose()
      useChatStore.setState({
        status: 'idle',
        publish: () => false,
        viewingRoomId: null,
        myUserId: null,
        pending: {},
        generationOf: () => undefined,
      })
    }
  }, [queryClient, userId])

  return null
}
