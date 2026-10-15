import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { chatKeys, chatRoomsQuery, markChatRoomRead } from '@/entities/chat/api'
import { clearUnread, unreadOf } from './incoming'
import { usePageActive } from './pageActive'

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
 */
export function useMarkRoomRead(
  chatRoomId: number,
  latestSequence: number | undefined,
) {
  const queryClient = useQueryClient()
  const active = usePageActive()
  // 보낸(응답을 기다리는 것 포함) 가장 큰 순번
  const sent = useRef(0)
  // 서버가 성공을 돌려준 가장 큰 순번
  const confirmed = useRef(0)
  const attempts = useRef(0)
  const mounted = useRef(true)
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [retryTick, setRetryTick] = useState(0)

  const { mutate } = useMutation({
    mutationFn: (sequence: number) => markChatRoomRead(chatRoomId, sequence),
    onSuccess: (_, sequence) => {
      confirmed.current = Math.max(confirmed.current, sequence)
      attempts.current = 0
    },
    onError: (error, sequence) => {
      if (import.meta.env.DEV) console.warn('읽음 처리 실패', error)
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
    mutate(latestSequence)
  }, [active, chatRoomId, latestSequence, mutate, queryClient, retryTick])
}
