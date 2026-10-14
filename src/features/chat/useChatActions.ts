import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { chatKeys, leaveChatRoom, startChat } from '@/entities/chat/api'
import { toast } from '@/shared/ui/toastStore'

/**
 * 채팅 시작(또는 다시 시작). 활성 방이 있으면 그 방으로, 상대가 나간 방이면 바로 재입장한다.
 * 재입장하면 내 조회 범위가 바뀌므로 그 방의 이력 캐시를 버리고 새로 불러온다.
 */
export function useStartChat() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: startChat,
    onSuccess: async (room) => {
      queryClient.removeQueries({
        queryKey: chatKeys.messages(room.chatRoomId),
      })
      await queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
      navigate(`/chat/${room.chatRoomId}`)
    },
    onError: (error) => toast(error.message),
  })
}

/** 방 나가기. 나가면 이 방의 기록을 더 볼 수 없으므로 캐시를 지운다. */
export function useLeaveChat() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (args: { chatRoomId: number; participationVersion: number }) =>
      leaveChatRoom(args.chatRoomId, args.participationVersion),
    onSuccess: async (_, { chatRoomId }) => {
      navigate('/chat', { replace: true })
      queryClient.removeQueries({ queryKey: chatKeys.messages(chatRoomId) })
      await queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
      toast('채팅방에서 나갔어요.')
    },
    onError: (error) => toast(error.message),
  })
}
