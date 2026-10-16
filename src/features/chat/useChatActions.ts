import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { chatKeys, leaveChatRoom, startChat } from '@/entities/chat/api'
import type { ChatRoom } from '@/entities/chat/types'
import { toast } from '@/shared/ui/toastStore'
import { useChatStore } from './chatStore'
import { broadcastRoomChanged, discardRoomState } from './roomSync'

/** 요청을 보낸 회원. 응답을 기다리는 동안 회원이 바뀌었으면(로그아웃·역할 전환) 결과를 반영하지 않는다 */
const requester = () => ({ userId: useChatStore.getState().myUserId })
const sameRequester = (context: { userId: number | null } | undefined) =>
  context?.userId != null && context.userId === useChatStore.getState().myUserId

/** 방 목록 캐시의 이 방 내 참여 */
function myMembership(queryClient: QueryClient, chatRoomId: number) {
  const { myUserId } = useChatStore.getState()
  return queryClient
    .getQueryData<ChatRoom[]>(chatKeys.rooms())
    ?.find((r) => r.chatRoomId === chatRoomId)
    ?.members.find((m) => m.userId === myUserId)
}

/**
 * 채팅 시작(또는 다시 시작). 활성 방이 있으면 그 방으로, 상대가 나간 방이면 바로 재입장한다.
 * 재입장하면 내 조회 범위가 바뀌므로 그 방의 이력 캐시와 보내는 중 표시를 버리고 새로 불러온다.
 * 다른 탭에도 알려 같은 방의 이전 참여 상태를 버리게 한다.
 */
export function useStartChat() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: startChat,
    onMutate: requester,
    onSuccess: async (room, _, context) => {
      if (!sameRequester(context)) return
      // 응답을 기다리는 동안 이 탭이 더 새 참여를 알게 됐으면(다른 탭의 나가기·다시 시작) 늦은 응답으로
      // 새 참여의 이력·보내는 중 표시를 지우거나 알리지 않는다.
      const mine = room.members?.find((m) => m.userId === context.userId)
      const known = myMembership(queryClient, room.chatRoomId)
      const outdated =
        mine !== undefined &&
        known !== undefined &&
        known.participationVersion > mine.participationVersion
      if (!outdated) {
        broadcastRoomChanged(room.chatRoomId, context.userId!)
        discardRoomState(queryClient, room.chatRoomId)
      }
      await queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
      navigate(`/chat/${room.chatRoomId}`)
    },
    onError: (error) => toast(error.message),
  })
}

const STALE_LEAVE =
  '다른 탭에서 이 채팅을 다시 시작해 방에 남아 있어요. 대화 목록에서 다시 열 수 있어요.'

/**
 * 방 나가기. 나가면 이 방의 기록을 더 볼 수 없으므로 캐시와 보내는 중 표시를 지우고 다른 탭에도 알린다.
 * 그사이 다른 탭에서 다시 시작해 참여 세대가 바뀌었으면 서버는 옛 세대의 나가기를 무시한다(204, 멱등).
 * - 이 탭이 이미 새 세대를 알면(탭 동기화) 새 참여의 이력·보내는 중 표시를 지우지 않고 남아 있다고 알린다
 * - 다시 불러온 방 목록에 새 세대로 남아 있으면 이 탭의 옛 참여 상태만 버리고 남아 있다고 알린다(다른 탭에는 알리지 않는다)
 */
export function useLeaveChat() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (args: { chatRoomId: number; participationVersion: number }) =>
      leaveChatRoom(args.chatRoomId, args.participationVersion),
    onMutate: requester,
    onSuccess: async (_, { chatRoomId, participationVersion }, context) => {
      if (!sameRequester(context)) return
      navigate('/chat', { replace: true })
      const known = myMembership(queryClient, chatRoomId)
      if (known && known.participationVersion !== participationVersion) {
        await queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
        toast(STALE_LEAVE)
        return
      }
      const refreshed = await queryClient
        .invalidateQueries(
          { queryKey: chatKeys.rooms() },
          { throwOnError: true },
        )
        .then(
          () => true,
          () => false,
        )
      if (!sameRequester(context)) return
      discardRoomState(queryClient, chatRoomId)
      // 방 목록을 다시 불러오지 못하면 서버가 옛 세대라 무시했는지 알 수 없어 다른 탭에는 알리지 않는다.
      if (!refreshed) {
        toast(
          '나가기를 처리했어요. 대화 목록을 불러오지 못해 늦게 바뀔 수 있어요.',
        )
        return
      }
      const now = myMembership(queryClient, chatRoomId)
      if (now?.active && now.participationVersion !== participationVersion) {
        toast(STALE_LEAVE)
        return
      }
      broadcastRoomChanged(chatRoomId, context.userId!)
      toast('채팅방에서 나갔어요.')
    },
    onError: (error) => toast(error.message),
  })
}
