import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { PagedModel } from '@/shared/api/types'
import { inquiryPollInterval } from './objection'
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
    // 이의 제기 접수·철회 결과를 기다리는 동안 다시 부른다.
    refetchInterval: (query) =>
      inquiryPollInterval(query.state.data, query.state.error),
  })

/**
 * 이의 제기는 강의가 바로 접수하면 201 + FILED, 결과를 아직 모르면 202 + FILING이다(BE가 매분 다시 접수한다).
 * 강의가 바로 거절하면 문의가 생기지 않고 4xx다.
 */
export function createInquiry(input: InquiryInput) {
  return api<Inquiry>('/inquiries', { method: 'POST', body: input })
}

/**
 * 답변이 달리기 전에만 지울 수 있다(INQUIRY_NOT_DELETABLE). 지워지면 204라 undefined다.
 * 접수된 이의 제기는 철회 요청이라 202 + WITHDRAWAL_PENDING 문의를 받고, 강의가 철회하면 문의가 지워진다.
 */
export function deleteInquiry(inquiryId: number) {
  return api<Inquiry | undefined>(`/inquiries/${inquiryId}`, {
    method: 'DELETE',
  })
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
    // 이의 제기 접수·판단·철회 결과를 기다리는 동안 다시 부른다.
    refetchInterval: (query) =>
      inquiryPollInterval(query.state.data, query.state.error),
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

/**
 * 강의 내용 다름 이의 제기 판단. 안내(content)는 강의가 판단을 반영한 뒤 문의 답변으로 달린다.
 * 보내면 202 + RESOLUTION_PENDING이고, 이미 반영된 같은 판단을 다시 보내면 200 + RESOLVED다.
 * 철회 처리 중이나 다른 판단이 처리 중이면 409 OBJECTION_IN_PROGRESS, 강의가 거절한 뒤면 409 OBJECTION_RECOVERY_REQUIRED다.
 */
export function resolveObjection(
  inquiryId: number,
  input: { accepted: boolean; content: string },
) {
  return api<Inquiry>(`/inquiries/admin/${inquiryId}/objection-resolution`, {
    method: 'POST',
    body: input,
  })
}
