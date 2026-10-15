import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import type {
  Inquiry,
  InquiryInput,
  InquirySort,
  InquiryStatus,
  InquirySummary,
} from './types'

export type MyInquiryParams = {
  keyword?: string
  sort: InquirySort
  page: number
}
export type AdminInquiryParams = {
  status?: InquiryStatus
  sort: InquirySort
  page: number
}

export const inquiryKeys = {
  all: ['inquiry'] as const,
  mine: (params: MyInquiryParams) =>
    [...inquiryKeys.all, 'mine', params] as const,
  detail: (inquiryId: number) =>
    [...inquiryKeys.all, 'detail', inquiryId] as const,
  admin: (params: AdminInquiryParams) =>
    [...inquiryKeys.all, 'admin', params] as const,
  adminDetail: (inquiryId: number) =>
    [...inquiryKeys.all, 'admin-detail', inquiryId] as const,
}

const PAGE_SIZE = 10

export const myInquiriesQuery = (params: MyInquiryParams) =>
  queryOptions({
    queryKey: inquiryKeys.mine(params),
    queryFn: () =>
      api<PagedModel<InquirySummary>>('/inquiries', {
        query: {
          keyword: params.keyword || undefined,
          sort: params.sort,
          page: params.page,
          size: PAGE_SIZE,
        },
      }),
    placeholderData: keepPreviousData,
  })

export const myInquiryQuery = (inquiryId: number) =>
  queryOptions({
    queryKey: inquiryKeys.detail(inquiryId),
    queryFn: () => api<Inquiry>(`/inquiries/${inquiryId}`),
  })

export function createInquiry(input: InquiryInput) {
  return api<Inquiry>('/inquiries', { method: 'POST', body: input })
}

/** 답변이 달리기 전에만 지울 수 있다(INQUIRY_NOT_DELETABLE) */
export function deleteInquiry(inquiryId: number) {
  return api<void>(`/inquiries/${inquiryId}`, { method: 'DELETE' })
}

// ── 관리자 ──

/** 전체 문의. 기본은 오래된 순(먼저 온 문의부터 답변) */
export const adminInquiriesQuery = (params: AdminInquiryParams) =>
  queryOptions({
    queryKey: inquiryKeys.admin(params),
    queryFn: () =>
      api<PagedModel<InquirySummary>>('/inquiries/admin', {
        query: {
          status: params.status,
          sort: params.sort,
          page: params.page,
          size: PAGE_SIZE,
        },
      }),
    placeholderData: keepPreviousData,
  })

export const adminInquiryQuery = (inquiryId: number) =>
  queryOptions({
    queryKey: inquiryKeys.adminDetail(inquiryId),
    queryFn: () => api<Inquiry>(`/inquiries/admin/${inquiryId}`),
  })

export function replyInquiry(inquiryId: number, content: string) {
  return api<Inquiry>(`/inquiries/admin/${inquiryId}/replies`, {
    method: 'POST',
    body: { content },
  })
}

export function editReply(inquiryId: number, replyId: number, content: string) {
  return api<Inquiry>(`/inquiries/admin/${inquiryId}/replies/${replyId}`, {
    method: 'PUT',
    body: { content },
  })
}

export function deleteReply(inquiryId: number, replyId: number) {
  return api<void>(`/inquiries/admin/${inquiryId}/replies/${replyId}`, {
    method: 'DELETE',
  })
}

/** 강의 내용 다름 이의 제기 판단. 안내(content)는 문의 답변으로 달린다 */
export function resolveObjection(
  inquiryId: number,
  input: { accepted: boolean; content: string },
) {
  return api<Inquiry>(`/inquiries/admin/${inquiryId}/objection-resolution`, {
    method: 'POST',
    body: input,
  })
}
