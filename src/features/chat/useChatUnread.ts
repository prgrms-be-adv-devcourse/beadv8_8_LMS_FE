import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { chatKeys, chatRoomsQuery, markChatRoomRead } from '@/entities/chat/api'
import type { ChatRoom } from '@/entities/chat/types'
import { isApiError } from '@/shared/api/ApiError'
import { useChatStore } from './chatStore'
import { clearUnread, unreadOf } from './incoming'
import { usePageActive } from './pageActive'
import { forgetRoom } from './roomSync'

/** 다시 보내도 소용없는 읽음 실패: 참여 세대가 바뀌었거나 참여가 끝났다. 방을 다시 맞춘다 */
const STALE_READ_CODES = [
  'STALE_PARTICIPATION',
  'NOT_CHAT_ROOM_MEMBER',
  'CHAT_ROOM_NOT_FOUND',
]

/** 읽음 요청이 실패하면 이 간격(× 시도 횟수)으로 다시 보낸다 */
export const READ_RETRY_DELAY_MS = 3_000
export const READ_RETRY_LIMIT = 3

/** 모든 방의 안 읽은 수 합 (내비 배지). 채팅을 쓰는 역할일 때만 방 목록을 부른다 */
export function useChatUnreadTotal(enabled: boolean) {
  const { data } = useQuery({
    ...chatRoomsQuery,
    enabled,
    select: (rooms) => rooms.reduce((sum, r) => sum + (r.unreadCount ?? 0), 0),
  })
  return data ?? 0
}

/**
 * 보고 있는 방을 읽음 처리한다. 화면에 보인 가장 최근 순번(latestSequence)이 커질 때마다
 * 서버에 알리고(줄어드는 값은 보내지 않는다) 방 목록의 안 읽은 수를 0으로 둔다.
 * - 탭이 가려졌거나 포커스가 없으면 미루고, 다시 보일 때 처리한다
 * - 실패하면 보낸 순번을 서버가 확인한 순번으로 되돌리고, 안 읽은 수는 방 목록을 다시 불러와 서버 값으로
 *   복구한 뒤 잠시 뒤 다시 보낸다(대화에는 영향이 없어 안내는 띄우지 않는다)
 * - 읽음 전에 만들어진 방 목록 응답이 읽음 확인 뒤에 도착해 안 읽은 수를 되살리면, 서버가 확인한 읽음 순번이 그 응답의
 *   마지막 메시지까지 닿은 경우 지운다(방 목록 재조회·대조가 읽음과 겹쳐도 배지가 다시 생기지 않게)
 * - participationVersion(이력 응답의 참여 세대)을 함께 보낸다. 세대가 맞지 않거나(409 STALE_PARTICIPATION) 참여가
 *   끝났으면 다시 보내지 않고 그 방의 이전 세대 상태를 버린 뒤 방 목록·이력을 다시 맞춘다
 */
export function useMarkRoomRead(
  chatRoomId: number,
  latestSequence: number | undefined,
  participationVersion?: number,
) {
  const queryClient = useQueryClient()
  const active = usePageActive()
  // 보낸(응답을 기다리는 것 포함) 가장 큰 순번
  const sent = useRef(0)
  // 서버가 성공을 돌려준 가장 큰 순번
  const confirmed = useRef(0)
  const attempts = useRef(0)
  // 지금 참여 세대. 옛 세대 요청의 실패로 새 세대 상태를 버리지 않게 비교한다.
  const currentVersion = useRef(participationVersion)
  const mounted = useRef(true)
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [retryTick, setRetryTick] = useState(0)

  // 방 목록의 이 방(안 읽은 수·마지막 메시지). 방 목록 응답이 바뀔 때마다 낡은 안 읽은 수인지 다시 본다.
  const { data: listed } = useQuery({
    ...chatRoomsQuery,
    select: (rooms: ChatRoom[]) =>
      rooms.find((r) => r.chatRoomId === chatRoomId),
  })
  /** 서버가 확인한 읽음 순번이 방 목록의 마지막 메시지까지 닿았는데 안 읽은 수가 남아 있으면 낡은 값이라 지운다 */
  const clearStaleUnread = useCallback(() => {
    const room = queryClient
      .getQueryData<ChatRoom[]>(chatKeys.rooms())
      ?.find((r) => r.chatRoomId === chatRoomId)
    if (
      room &&
      (room.unreadCount ?? 0) > 0 &&
      confirmed.current > 0 &&
      (room.lastMessage?.roomSequence ?? 0) <= confirmed.current
    )
      clearUnread(queryClient, chatRoomId)
  }, [chatRoomId, queryClient])

  const { mutate } = useMutation({
    mutationFn: ({
      sequence,
      version,
    }: {
      sequence: number
      version?: number
    }) => markChatRoomRead(chatRoomId, sequence, version),
    onSuccess: (_, { sequence, version }) => {
      // 그사이 세대가 바뀌었으면(재입장) 옛 세대의 읽음 확인을 새 세대 순번으로 세지 않는다.
      if (version !== currentVersion.current) return
      confirmed.current = Math.max(confirmed.current, sequence)
      attempts.current = 0
      if (mounted.current) clearStaleUnread()
    },
    onError: (error, { sequence, version }) => {
      if (import.meta.env.DEV) console.warn('읽음 처리 실패', error)
      // 화면을 떠난 뒤(다시 들어오면 새 훅이 처리한다) 또는 이미 다른 세대로 바뀐 뒤 도착한 옛 요청의 실패는 무시한다
      // (새 세대의 이력·보내는 중 표시를 버리지 않게).
      if (!mounted.current || version !== currentVersion.current) return
      // 화면 캐시가 아직 옛 세대여도 채팅 연결이 더 높은 세대를 관측했으면 이 요청은 옛 세대다. 이전 세대 상태는 세대를
      // 관측할 때 이미 버렸으므로, 그 뒤 새 세대에서 만든 보내는 중 표시를 지우지 않는다.
      const observed = useChatStore.getState().generationOf(chatRoomId)
      if (version !== undefined && observed !== undefined && observed > version)
        return
      if (STALE_READ_CODES.some((code) => isApiError(error, code))) {
        void forgetRoom(queryClient, chatRoomId)
        return
      }
      // 그사이 더 큰 순번이 성공했으면 이 순번까지 읽음 처리됐다.
      if (confirmed.current >= sequence) return
      sent.current = confirmed.current
      // 서버는 읽음을 기록하지 않았으므로 서버 값이 맞다(겹친 요청·재조회와 상관없이).
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
      // 방을 떠난 뒤 도착한 실패는 다시 보내지 않는다(다시 열면 새로 처리한다).
      if (!mounted.current || attempts.current >= READ_RETRY_LIMIT) return
      attempts.current += 1
      clearTimeout(retryTimer.current)
      retryTimer.current = setTimeout(
        () => setRetryTick((n) => n + 1),
        READ_RETRY_DELAY_MS * attempts.current,
      )
    },
  })

  // 참여 세대가 바뀌면(재입장) 이전 세대에서 보낸·확인된 순번을 잊고 새로 센다.
  useEffect(() => {
    currentVersion.current = participationVersion
    sent.current = 0
    confirmed.current = 0
    attempts.current = 0
  }, [participationVersion])

  useEffect(() => {
    clearStaleUnread()
  }, [listed, clearStaleUnread])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearTimeout(retryTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!active || latestSequence === undefined) return
    if (latestSequence <= sent.current) {
      // 이미 읽음 처리한 순번 이하만 있는데 안 읽은 수가 남았으면(가려진 동안 늦게 온 이전 메시지) 지운다.
      if (unreadOf(queryClient, chatRoomId) > 0)
        clearUnread(queryClient, chatRoomId)
      return
    }
    sent.current = latestSequence
    clearUnread(queryClient, chatRoomId)
    mutate({ sequence: latestSequence, version: participationVersion })
  }, [
    active,
    chatRoomId,
    latestSequence,
    participationVersion,
    mutate,
    queryClient,
    retryTick,
  ])
}
