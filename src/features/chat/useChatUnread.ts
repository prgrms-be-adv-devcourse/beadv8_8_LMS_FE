import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { chatRoomsQuery, markChatRoomRead } from '@/entities/chat/api'
import { clearUnread } from './incoming'

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
 * 실패해도(예: 읽음 API가 없는 BE) 대화에는 영향이 없으므로 조용히 넘어간다.
 */
export function useMarkRoomRead(
  chatRoomId: number,
  latestSequence: number | undefined,
) {
  const queryClient = useQueryClient()
  const sent = useRef(0)
  const { mutate } = useMutation({
    mutationFn: (sequence: number) => markChatRoomRead(chatRoomId, sequence),
    onError: (error) => {
      if (import.meta.env.DEV) console.warn('읽음 처리 실패', error)
    },
  })

  useEffect(() => {
    if (latestSequence === undefined || latestSequence <= sent.current) return
    sent.current = latestSequence
    clearUnread(queryClient, chatRoomId)
    mutate(latestSequence)
  }, [chatRoomId, latestSequence, mutate, queryClient])
}
