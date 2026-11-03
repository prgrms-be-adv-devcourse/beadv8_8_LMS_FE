import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import {
  chatKeys,
  closeChatGroup,
  createChatGroup,
  inviteChatMembers,
  kickChatMember,
} from '@/entities/chat/api'
import { appearanceKeys } from '@/entities/appearance/api'
import { isApiError } from '@/shared/api/ApiError'
import { toast } from '@/shared/ui/toastStore'

/**
 * 모집 단체방 만들기(호스트). 모집글의 현재 방이 이미 있으면 서버가 그 방을 돌려준다(200). 어느 쪽이든 그 방을 연다.
 * 실패 사유(호스트 아님·모집 중 아님·출연 정보 확인 불가)는 서버 문구로 알린다
 */
export function useCreateGroup(recruitId: number) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () => createChatGroup(recruitId),
    onSuccess: async (room) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatKeys.rooms() }),
        queryClient.invalidateQueries({ queryKey: chatKeys.groups(recruitId) }),
      ])
      navigate(`/chat/${room.chatRoomId}`)
    },
    onError: (error) => {
      // 모집글 상태가 바뀌었거나(마감·취소) 다른 탭에서 방을 만들었을 수 있어 모집글과 단체방을 다시 받는다.
      void queryClient.invalidateQueries({
        queryKey: chatKeys.groups(recruitId),
      })
      void queryClient.invalidateQueries({
        queryKey: appearanceKeys.recruit(recruitId),
      })
      toast(error.message)
    },
  })
}

/**
 * 여러 명 초대(호스트). 회원별 결과는 부르는 쪽(초대 모달)이 보여 준다.
 * 끝나면 후보(실패한 회원은 다시 나온다)·참여자·방 목록(인원)을 다시 받는다
 */
export function useInviteMembers(chatRoomId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      requestId,
      userIds,
    }: {
      requestId: string
      userIds: number[]
    }) => inviteChatMembers(chatRoomId, requestId, userIds),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: chatKeys.candidates(chatRoomId),
      })
      void queryClient.invalidateQueries({
        queryKey: chatKeys.members(chatRoomId),
      })
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
    },
  })
}

/**
 * 내보내기(호스트). 대상의 참여 세대를 함께 보낸다. 그사이 대상이 나갔다가 다시 초대됐으면(세대가 다름) 서버가 거절하므로
 * 참여자 목록을 새로 받아 다시 고르게 한다
 */
export function useKickMember(chatRoomId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      userId,
      participationVersion,
    }: {
      userId: number
      nickname: string
      participationVersion: number
    }) => kickChatMember(chatRoomId, userId, participationVersion),
    onSuccess: (_, { nickname }) => toast(`${nickname} 님을 내보냈어요.`),
    onError: (error) =>
      toast(
        isApiError(error, 'STALE_PARTICIPATION')
          ? '참여 상태가 바뀌었어요. 참여자 목록을 새로 불러왔으니 다시 확인해 주세요.'
          : error.message,
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: chatKeys.members(chatRoomId),
      })
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
    },
  })
}

/** 폐쇄(호스트). 방은 읽기 전용이 되고 참여자는 30일 동안 대화를 볼 수 있다 */
export function useCloseGroup(chatRoomId: number, recruitId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => closeChatGroup(chatRoomId),
    onSuccess: () => toast('단체방을 폐쇄했어요. 이제 읽기 전용이에요.'),
    onError: (error) => toast(error.message),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() })
      void queryClient.invalidateQueries({
        queryKey: chatKeys.groups(recruitId),
      })
    },
  })
}
