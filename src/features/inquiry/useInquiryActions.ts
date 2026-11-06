import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import {
  createInquiry,
  deleteInquiry,
  deleteReply,
  editReply,
  inquiryKeys,
  replyInquiry,
  resolveObjection,
} from '@/entities/inquiry/api'
import type { InquiryInput } from '@/entities/inquiry/types'
import { orderKeys } from '@/entities/order/api'
import { toast } from '@/shared/ui/toastStore'

/** 이의 제기는 주문 항목의 지급 중단 상태를 바꾸므로 구매 목록도 다시 부른다. */
function useInvalidateInquiries() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: inquiryKeys.all }),
      queryClient.invalidateQueries({ queryKey: orderKeys.all }),
    ])
}

/**
 * 이의 제기 접수 결과를 아직 모르면(202 + FILING) 문의 상세로 옮겨 결과가 나올 때까지 보여 준다.
 * 목록에는 연동 상태가 없어 고객센터에 남으면 처리 중을 볼 곳이 없다.
 */
export function useCreateInquiry() {
  const invalidate = useInvalidateInquiries()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (input: InquiryInput) => createInquiry(input),
    onSuccess: (inquiry, input) => {
      if (inquiry.objectionLinkStatus === 'FILING') {
        toast('문의를 저장했어요. 이의 제기 접수 결과를 확인하고 있어요.')
        queryClient.setQueryData(inquiryKeys.detail(inquiry.inquiryId), inquiry)
        navigate(`/support/inquiries/${inquiry.inquiryId}`)
        return
      }
      toast(
        input.category === 'LECTURE_CONTENT_DISPUTE'
          ? '이의 제기를 접수했어요. 판단이 나올 때까지 판매자 지급이 멈춰요.'
          : '문의를 접수했어요.',
      )
    },
    onError: (error) => toast(error.message),
    onSettled: invalidate,
  })
}

/**
 * 답변 대기일 때만 지울 수 있다. 지워지면(204) 고객센터로 돌아간다.
 * 접수된 이의 제기는 철회 요청이라(202 + WITHDRAWAL_PENDING) 상세에 남아 철회 처리 중을 보인다.
 * 강의가 철회하면 문의가 지워지고, 상세가 그것을 보고 고객센터로 돌아간다(isWithdrawn).
 */
export function useDeleteInquiry(inquiryId: number) {
  const invalidate = useInvalidateInquiries()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () => deleteInquiry(inquiryId),
    onSuccess: (inquiry) => {
      if (inquiry?.objectionLinkStatus === 'WITHDRAWAL_PENDING') {
        toast('이의 제기 철회를 요청했어요. 철회가 끝나면 문의가 사라져요.')
        queryClient.setQueryData(inquiryKeys.detail(inquiryId), inquiry)
        return
      }
      toast('문의를 삭제했어요.')
      navigate('/support', { replace: true })
    },
    onError: (error) => toast(error.message),
    onSettled: invalidate,
  })
}

// ── 관리자 ──

export function useReplyInquiry(inquiryId: number) {
  const invalidate = useInvalidateInquiries()
  return useMutation({
    mutationFn: (content: string) => replyInquiry(inquiryId, content),
    onSuccess: () => toast('답변을 달았어요.'),
    onError: (error) => toast(error.message),
    onSettled: invalidate,
  })
}

export function useEditReply(inquiryId: number) {
  const invalidate = useInvalidateInquiries()
  return useMutation({
    mutationFn: ({ replyId, content }: { replyId: number; content: string }) =>
      editReply(inquiryId, replyId, content),
    onSuccess: () => toast('답변을 고쳤어요.'),
    onError: (error) => toast(error.message),
    onSettled: invalidate,
  })
}

/** 답변을 모두 지우면 다시 답변 대기가 된다. */
export function useDeleteReply(inquiryId: number) {
  const invalidate = useInvalidateInquiries()
  return useMutation({
    mutationFn: (replyId: number) => deleteReply(inquiryId, replyId),
    onSuccess: () => toast('답변을 삭제했어요.'),
    onError: (error) => toast(error.message),
    onSettled: invalidate,
  })
}

export function useResolveObjection(inquiryId: number) {
  const invalidate = useInvalidateInquiries()
  return useMutation({
    mutationFn: (input: { accepted: boolean; content: string }) =>
      resolveObjection(inquiryId, input),
    // 보통은 202(판단 처리 중)라 아직 끝난 게 아니다. 이미 반영된 같은 판단을 다시 보냈을 때만 200이다.
    onSuccess: (inquiry, input) =>
      toast(
        inquiry.objectionLinkStatus === 'RESOLUTION_PENDING'
          ? '판단을 보냈어요. 강의에 반영되면 결과가 보여요.'
          : input.accepted
            ? '이의 제기를 인정했어요. 구매자에게 HP가 반환돼요.'
            : '이의 제기를 기각했어요. 판매자에게 지급돼요.',
      ),
    onError: (error) => toast(error.message),
    onSettled: invalidate,
  })
}
