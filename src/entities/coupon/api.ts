import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type {
  Coupon,
  CouponCreateInput,
  CouponStatus,
  CouponSummary,
  IssueRequestResult,
  IssueStatusView,
  MemberCoupon,
  MemberCouponStatus,
} from './types'

/**
 * 쿠폰 API. 경로는 `/coupons/...`(api()가 /api/v1을 붙인다).
 * 목록·상세 조회는 BE 조회 API 계약(병합 전에는 테스트의 MSW로만 동작), 나머지는 dev에 있는 쿠폰 3단계 API다.
 */
export const couponKeys = {
  all: ['coupon'] as const,
  /** 내 쿠폰함 */
  mine: (status: MemberCouponStatus | null) =>
    [...couponKeys.all, 'mine', status] as const,
  /** 강의에서 받을 수 있는 쿠폰 */
  forLecture: (lectureId: number) =>
    [...couponKeys.all, 'lecture', lectureId] as const,
  /** 발급 요청 처리 상태 */
  issueStatus: (couponId: number, issueRequestId: string) =>
    [...couponKeys.all, 'issue', couponId, issueRequestId] as const,
  seller: (status: CouponStatus | null) =>
    [...couponKeys.all, 'seller', status] as const,
  sellerDetail: (couponId: number) =>
    [...couponKeys.all, 'seller', 'detail', couponId] as const,
  admin: (status: CouponStatus | null) =>
    [...couponKeys.all, 'admin', status] as const,
  adminDetail: (couponId: number) =>
    [...couponKeys.all, 'admin', 'detail', couponId] as const,
}

// ── 회원 ──

/** 내 쿠폰함. status가 없으면 전체(페이지 없음) */
export const myCouponsQuery = (status: MemberCouponStatus | null) =>
  queryOptions({
    queryKey: couponKeys.mine(status),
    queryFn: () =>
      api<MemberCoupon[]>('/coupons/me', {
        query: { status: status ?? undefined },
      }),
  })

/** 그 강의에 지금 받을 수 있는 쿠폰(OPEN·기간 안, 특정 강의 + 모든 강의). 소진·이미 받음 표시 포함. BE 조회 API */
export const lectureCouponsQuery = (lectureId: number) =>
  queryOptions({
    queryKey: couponKeys.forLecture(lectureId),
    queryFn: () => api<CouponSummary[]>('/coupons', { query: { lectureId } }),
  })

/**
 * 발급 접수(202). issueRequestId는 멱등 키(`^[A-Za-z0-9_-]{1,64}$`)다. 응답을 못 받아 다시 보낼 때는 같은 값을 쓴다
 * (같은 값이면 ALREADY_ACCEPTED, 성공으로 본다)
 */
export function requestCouponIssue(couponId: number, issueRequestId: string) {
  return api<IssueRequestResult>(`/coupons/${couponId}/issue-requests`, {
    method: 'POST',
    body: { issueRequestId },
  })
}

/** 발급 요청 처리 상태 */
export function fetchIssueStatus(couponId: number, issueRequestId: string) {
  return api<IssueStatusView>(
    `/coupons/${couponId}/issue-requests/${encodeURIComponent(issueRequestId)}`,
  )
}

// ── 판매자(인증된 인플루언서) ──

/** 내가 신청한 쿠폰(최신순). BE 조회 API */
export const sellerCouponsQuery = (status: CouponStatus | null) =>
  queryOptions({
    queryKey: couponKeys.seller(status),
    queryFn: () =>
      api<Coupon[]>('/coupons/seller', {
        query: { status: status ?? undefined },
      }),
  })

/** 내가 신청한 쿠폰 상세. 본인 것이 아니면 403 NOT_COUPON_OWNER. BE 조회 API */
export const sellerCouponQuery = (couponId: number) =>
  queryOptions({
    queryKey: couponKeys.sellerDetail(couponId),
    queryFn: () => api<Coupon>(`/coupons/seller/${couponId}`),
  })

/** 쿠폰 신청(DRAFT, 201). 판매 중인 내 강의만, 대상은 LECTURE만 */
export function createSellerCoupon(input: CouponCreateInput) {
  return api<Coupon>('/coupons/seller', { method: 'POST', body: input })
}

/** 심사 요청(DRAFT → REVIEW) */
export function requestCouponReview(couponId: number) {
  return api<Coupon>(`/coupons/seller/${couponId}/review`, { method: 'POST' })
}

/** 판매자 발급 중단 */
export function suspendSellerCoupon(couponId: number) {
  return api<Coupon>(`/coupons/seller/${couponId}/suspend`, { method: 'POST' })
}

// ── 관리자 ──

/** 전체 쿠폰(최신순). BE 조회 API */
export const adminCouponsQuery = (status: CouponStatus | null) =>
  queryOptions({
    queryKey: couponKeys.admin(status),
    queryFn: () =>
      api<Coupon[]>('/coupons/admin', {
        query: { status: status ?? undefined },
      }),
  })

/** 쿠폰 상세(관리자). BE 조회 API */
export const adminCouponQuery = (couponId: number) =>
  queryOptions({
    queryKey: couponKeys.adminDetail(couponId),
    queryFn: () => api<Coupon>(`/coupons/admin/${couponId}`),
  })

/** 플랫폼 쿠폰 생성(201) */
export function createPlatformCoupon(input: CouponCreateInput) {
  return api<Coupon>('/coupons/admin', { method: 'POST', body: input })
}

/** 관리자 상태 조작. reject만 사유가 있다 */
export type AdminCouponAction =
  'open' | 'approve' | 'suspend' | 'resume' | 'close'

export function changeCouponStatus(
  couponId: number,
  action: AdminCouponAction,
) {
  return api<Coupon>(`/coupons/admin/${couponId}/${action}`, {
    method: 'POST',
  })
}

/** 반려(REVIEW → REJECTED). 사유 1~500자 */
export function rejectCoupon(couponId: number, reason: string) {
  return api<Coupon>(`/coupons/admin/${couponId}/reject`, {
    method: 'POST',
    body: { reason },
  })
}
