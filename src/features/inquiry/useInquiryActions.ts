import { useMutation, useQueryClient } from '@tanstack/react-query'
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

export function useCreateInquiry() {
  const invalidate = useInvalidateInquiries()
  return useMutation({
    mutationFn: (input: InquiryInput) => createInquiry(input),
    onSuccess: (_, input) =>
      toast(
        input.category === 'LECTURE_CONTENT_DISPUTE'
          ? '이의 제기를 접수했어요. 판단이 나올 때까지 판매자 지급이 멈춰요.'
          : '문의를 접수했어요.',
      ),
    onError: (error) => toast(error.message),
    onSettled: invalidate,
  })
}

/** 답변 대기일 때만 지울 수 있다. 이의 제기 문의를 지우면 이의 제기도 철회된다. */
export function useDeleteInquiry(inquiryId: number) {
  const invalidate = useInvalidateInquiries()
  return useMutation({
    mutationFn: () => deleteInquiry(inquiryId),
    onSuccess: () => toast('문의를 삭제했어요.'),
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
    onSuccess: (_, input) =>
      toast(
        input.accepted
          ? '이의 제기를 인정했어요. 구매자에게 HP가 반환돼요.'
          : '이의 제기를 기각했어요. 판매자에게 지급돼요.',
      ),
    onError: (error) => toast(error.message),
    onSettled: invalidate,
  })
}
