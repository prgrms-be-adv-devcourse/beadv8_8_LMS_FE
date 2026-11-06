import { isApiError } from '@/shared/api/ApiError'
import type { Inquiry, ObjectionLinkStatus } from './types'

/**
 * 강의 연동 결과를 기다리는 문의를 다시 부르는 간격(주문 처리 중과 같다).
 * BE는 접수를 매분 다시 시도하고, 판단·철회 결과는 강의 이벤트로 받는다(D60·D71).
 */
export const OBJECTION_POLL_MS = 5_000

/** 강의 연동 결과를 기다리는 상태. 강의가 거절한 것(*_FAILED)은 운영 복구(BE #267)를 기다려서 다시 부르지 않는다 */
const IN_PROGRESS: ReadonlySet<ObjectionLinkStatus | null> = new Set([
  'FILING',
  'RESOLUTION_PENDING',
  'WITHDRAWAL_PENDING',
])

export function isObjectionInProgress(inquiry: Inquiry) {
  return IN_PROGRESS.has(inquiry.objectionLinkStatus)
}

/**
 * 철회 처리 중이던 문의가 사라졌다(404). 강의가 철회를 반영해 BE가 문의를 지웠다.
 * 다시 부르기가 실패해도 TanStack Query는 마지막으로 받은 문의를 남겨 두므로 둘을 함께 본다.
 */
export function isWithdrawn(inquiry: Inquiry | undefined, error: unknown) {
  return (
    inquiry?.objectionLinkStatus === 'WITHDRAWAL_PENDING' &&
    isApiError(error, 'INQUIRY_NOT_FOUND')
  )
}

/** 문의 상세를 다시 부를 간격. 연동 결과를 기다리는 동안만 다시 부르고, 문의가 사라지면(404) 멈춘다 */
export function inquiryPollInterval(
  inquiry: Inquiry | undefined,
  error: unknown,
): number | false {
  if (!inquiry || isApiError(error, 'INQUIRY_NOT_FOUND')) return false
  return isObjectionInProgress(inquiry) ? OBJECTION_POLL_MS : false
}

/**
 * 회원이 문의를 지울 수 있는지. 답변 대기일 때만 되고, 이의 제기는 접수됨(철회 요청)·접수 불가(바로 삭제)일 때만 BE가 받는다.
 * 연동 상태가 없는 이의 제기는 BE가 접수 불가로 본다.
 */
export function canDeleteInquiry(inquiry: Inquiry) {
  if (inquiry.status !== 'WAITING') return false
  if (inquiry.category !== 'LECTURE_CONTENT_DISPUTE') return true
  switch (inquiry.objectionLinkStatus) {
    case 'FILED':
    case 'FILE_REJECTED':
    case null:
      return true
    default:
      return false
  }
}

/**
 * 관리자 상세 아래에 열 폼. 판단은 접수된 이의 제기에만 할 수 있다.
 * 일반 답변은 강의 연동이 없거나(접수 불가 포함) 끝난 문의에만 연다. 처리 중·강의 거절·모르는 상태에서는 폼을 열지 않는다.
 */
export function adminFormOf(inquiry: Inquiry): 'resolve' | 'reply' | null {
  if (inquiry.category !== 'LECTURE_CONTENT_DISPUTE') return 'reply'
  switch (inquiry.objectionLinkStatus) {
    case 'FILED':
      return 'resolve'
    case 'FILE_REJECTED':
    case 'RESOLVED':
    case null:
      return 'reply'
    default:
      return null
  }
}
