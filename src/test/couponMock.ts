import { http, HttpResponse } from 'msw'
import type {
  Coupon,
  CouponCreateInput,
  CouponStatus,
  CouponSummary,
  IssueStatus,
  MemberCoupon,
} from '@/entities/coupon/types'
import { ME_ID, rs } from './renderApp'
import { server } from './server'

/**
 * 쿠폰 BE 흉내(테스트 전용). 생성·조작·발급 접수·상태 조회는 dev의 쿠폰 3단계 계약, 목록·상세 조회와 이름(`name`)·
 * `rejectReason`은 BE 조회 API 계약을 따른다. 상태는 이 호출 안에만 있고 테스트가 끝나면 핸들러와 함께 사라진다.
 * 오류를 내려면 `failNext`에 '메서드 경로'(예: 'POST /coupons/7/issue-requests')별로 응답을 넣는다(한 번 쓰고 지운다).
 */

/** ProblemDetail 오류 응답 */
export const couponProblem = (
  status: number,
  code: string,
  detail = code,
  errors?: { field: string; message: string }[],
) =>
  HttpResponse.json(
    { status, code, detail, ...(errors ? { errors } : {}) },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )

export const coupon = (patch: Partial<Coupon> = {}): Coupon => ({
  couponId: 1,
  name: '가을맞이 10% 할인',
  type: 'SELLER',
  applicantId: ME_ID,
  targetType: 'LECTURE',
  lectureId: 7,
  basePrice: 30000,
  discountType: 'RATE',
  discountValue: 10,
  maxDiscountAmount: null,
  quantity: 100,
  issuedCount: 0,
  issueStartAt: '2026-11-01T01:00:00Z',
  issueEndAt: '2999-11-30T14:59:00Z',
  expiryType: 'RELATIVE',
  expiryDays: 30,
  fixedExpiresAt: null,
  stackable: false,
  policyVersion: 1,
  status: 'DRAFT',
  rejectReason: null,
  ...patch,
})

export const couponSummary = (
  patch: Partial<CouponSummary> = {},
): CouponSummary => ({
  couponId: 1,
  name: '가을맞이 10% 할인',
  type: 'SELLER',
  targetType: 'LECTURE',
  lectureId: 7,
  discountType: 'RATE',
  discountValue: 10,
  maxDiscountAmount: null,
  stackable: false,
  issueStartAt: '2026-11-01T01:00:00Z',
  issueEndAt: '2999-11-30T14:59:00Z',
  expiryType: 'RELATIVE',
  expiryDays: 30,
  fixedExpiresAt: null,
  quantity: 100,
  issuedCount: 40,
  soldOut: false,
  issued: false,
  status: 'OPEN',
  ...patch,
})

export const memberCoupon = (
  patch: Partial<MemberCoupon> = {},
): MemberCoupon => ({
  memberCouponId: 1,
  couponId: 1,
  couponName: '가을맞이 10% 할인',
  status: 'AVAILABLE',
  issuedAt: '2026-11-08T01:00:00Z',
  expiresAt: '2026-12-08T01:00:00Z',
  targetType: 'LECTURE',
  lectureId: 7,
  discountType: 'RATE',
  discountValue: 10,
  maxDiscountAmount: null,
  stackable: false,
  ...patch,
})

export type CouponMockState = {
  /** 내 쿠폰함 */
  mine: MemberCoupon[]
  /** 강의별로 받을 수 있는 쿠폰(GET /coupons?lectureId=). 키는 강의 ID */
  lectureCoupons: Record<number, CouponSummary[]>
  /** 판매자가 신청한 쿠폰(최신이 앞) */
  seller: Coupon[]
  /** 관리자가 보는 전체 쿠폰(최신이 앞) */
  admin: Coupon[]
  /**
   * 발급 요청 상태 응답 차례. GET …/issue-requests/{id}를 부를 때마다 앞에서 하나씩 쓰고, 마지막 값은 계속 쓴다.
   * 비어 있으면 PENDING
   */
  issueStatuses: IssueStatus[]
  /** REJECTED일 때의 사유 */
  issueRejectReason: string | null
  /** 받은 발급 요청(요청 ID 순서대로) */
  issueRequests: { couponId: number; issueRequestId: string }[]
  /** 상태 조회 요청 수 */
  statusCalls: number
  /** 받은 생성 요청 본문 */
  created: CouponCreateInput[]
  /** 받은 조작 요청('open 3', 'reject 3' 등) */
  actions: string[]
  /** 받은 반려 사유 */
  rejectReasons: string[]
  /** 다음 한 번만 낼 오류(키: 'METHOD /path', 경로는 /api/v1 뒤) */
  failNext: Record<string, Response>
  /** 생성 때 붙일 다음 쿠폰 ID */
  nextId: number
}

/** 상태 전이(BE Coupon 도메인과 같은 규칙만 흉내 낸다. 맞지 않으면 409 INVALID_COUPON_STATUS) */
const TRANSITIONS: Record<string, { from: CouponStatus[]; to: CouponStatus }> =
  {
    review: { from: ['DRAFT'], to: 'REVIEW' },
    approve: { from: ['REVIEW'], to: 'OPEN' },
    reject: { from: ['REVIEW'], to: 'REJECTED' },
    open: { from: ['DRAFT'], to: 'OPEN' },
    suspend: { from: ['OPEN'], to: 'SUSPENDED' },
    resume: { from: ['SUSPENDED'], to: 'OPEN' },
    close: { from: ['OPEN', 'SUSPENDED'], to: 'CLOSED' },
  }

export function mockCoupons(init: Partial<CouponMockState> = {}) {
  const state: CouponMockState = {
    mine: [],
    lectureCoupons: {},
    seller: [],
    admin: [],
    issueStatuses: [],
    issueRejectReason: null,
    issueRequests: [],
    statusCalls: 0,
    created: [],
    actions: [],
    rejectReasons: [],
    failNext: {},
    nextId: 100,
    ...init,
  }

  /** 걸어 둔 오류가 있으면 한 번 쓰고 지운다 */
  const failure = (key: string) => {
    const response = state.failNext[key]
    if (!response) return null
    delete state.failNext[key]
    return response
  }
  const byStatus = <T extends { status: string }>(
    list: T[],
    status: string | null,
  ) => (status ? list.filter((c) => c.status === status) : list)

  const transition = (list: Coupon[], couponId: number, action: string) => {
    const target = list.find((c) => c.couponId === couponId)
    if (!target)
      return couponProblem(404, 'COUPON_NOT_FOUND', '쿠폰을 찾을 수 없습니다.')
    const rule = TRANSITIONS[action]
    if (!rule.from.includes(target.status))
      return couponProblem(
        409,
        'INVALID_COUPON_STATUS',
        '지금 상태에서는 할 수 없습니다.',
      )
    target.status = rule.to
    target.policyVersion += 1
    return rs(target)
  }

  const create = (input: CouponCreateInput, type: Coupon['type']) => {
    state.created.push(input)
    const made = coupon({
      ...input,
      couponId: state.nextId++,
      type,
      applicantId: type === 'SELLER' ? ME_ID : null,
      basePrice: input.lectureId === null ? null : 30000,
      issuedCount: 0,
      policyVersion: 1,
      status: 'DRAFT',
      rejectReason: null,
    })
    return made
  }

  server.use(
    // ── 회원 ──
    http.get('*/api/v1/coupons/me', ({ request }) => {
      const status = new URL(request.url).searchParams.get('status')
      return failure('GET /coupons/me') ?? rs(byStatus(state.mine, status))
    }),
    http.get('*/api/v1/coupons/me/usable', () => rs([])),
    http.post(
      '*/api/v1/coupons/:couponId/issue-requests',
      async ({ params, request }) => {
        const couponId = Number(params.couponId)
        const { issueRequestId } = (await request.json()) as {
          issueRequestId: string
        }
        const failed = failure(`POST /coupons/${couponId}/issue-requests`)
        // 요청은 오류여도 기록한다(같은 ID로 다시 보냈는지 테스트가 본다).
        state.issueRequests.push({ couponId, issueRequestId })
        if (failed) return failed
        const already =
          state.issueRequests.filter(
            (r) =>
              r.couponId === couponId && r.issueRequestId === issueRequestId,
          ).length > 1
        return rs(
          {
            issueRequestId,
            couponId,
            result: already ? 'ALREADY_ACCEPTED' : 'ACCEPTED',
            expiresAt: '2026-12-08T01:00:00Z',
          },
          202,
        )
      },
    ),
    http.get(
      '*/api/v1/coupons/:couponId/issue-requests/:issueRequestId',
      ({ params }) => {
        state.statusCalls++
        const status =
          state.issueStatuses.length > 1
            ? state.issueStatuses.shift()!
            : (state.issueStatuses[0] ?? 'PENDING')
        return rs({
          issueRequestId: String(params.issueRequestId),
          couponId: Number(params.couponId),
          status,
          rejectReason: status === 'REJECTED' ? state.issueRejectReason : null,
        })
      },
    ),

    // ── 판매자 ──
    http.get('*/api/v1/coupons/seller', ({ request }) => {
      const status = new URL(request.url).searchParams.get('status')
      return (
        failure('GET /coupons/seller') ?? rs(byStatus(state.seller, status))
      )
    }),
    http.get('*/api/v1/coupons/seller/:couponId', ({ params }) => {
      const found = state.seller.find(
        (c) => c.couponId === Number(params.couponId),
      )
      return found
        ? rs(found)
        : couponProblem(403, 'NOT_COUPON_OWNER', '본인 쿠폰이 아닙니다.')
    }),
    http.post('*/api/v1/coupons/seller', async ({ request }) => {
      const input = (await request.json()) as CouponCreateInput
      const failed = failure('POST /coupons/seller')
      if (failed) {
        state.created.push(input)
        return failed
      }
      const made = create(input, 'SELLER')
      state.seller.unshift(made)
      return rs(made, 201)
    }),
    http.post('*/api/v1/coupons/seller/:couponId/:action', ({ params }) => {
      const action = String(params.action)
      const couponId = Number(params.couponId)
      state.actions.push(`${action} ${couponId}`)
      return (
        failure(`POST /coupons/seller/${couponId}/${action}`) ??
        transition(state.seller, couponId, action)
      )
    }),

    // ── 관리자 ──
    http.get('*/api/v1/coupons/admin', ({ request }) => {
      const status = new URL(request.url).searchParams.get('status')
      return failure('GET /coupons/admin') ?? rs(byStatus(state.admin, status))
    }),
    http.get('*/api/v1/coupons/admin/:couponId', ({ params }) => {
      const found = state.admin.find(
        (c) => c.couponId === Number(params.couponId),
      )
      return found
        ? rs(found)
        : couponProblem(404, 'COUPON_NOT_FOUND', '쿠폰을 찾을 수 없습니다.')
    }),
    http.post('*/api/v1/coupons/admin', async ({ request }) => {
      const input = (await request.json()) as CouponCreateInput
      const failed = failure('POST /coupons/admin')
      if (failed) {
        state.created.push(input)
        return failed
      }
      const made = create(input, 'PLATFORM')
      state.admin.unshift(made)
      return rs(made, 201)
    }),
    http.post(
      '*/api/v1/coupons/admin/:couponId/:action',
      async ({ params, request }) => {
        const action = String(params.action)
        const couponId = Number(params.couponId)
        state.actions.push(`${action} ${couponId}`)
        if (action === 'reject') {
          const { reason } = (await request.json()) as { reason: string }
          state.rejectReasons.push(reason)
          const failed = failure(`POST /coupons/admin/${couponId}/reject`)
          if (failed) return failed
          const result = transition(state.admin, couponId, 'reject')
          const target = state.admin.find((c) => c.couponId === couponId)
          if (target?.status === 'REJECTED') target.rejectReason = reason
          return result
        }
        return (
          failure(`POST /coupons/admin/${couponId}/${action}`) ??
          transition(state.admin, couponId, action)
        )
      },
    ),
    // 강의에서 받을 수 있는 쿠폰. '/coupons/:couponId' 같은 경로와 겹치지 않게 맨 뒤에 둔다.
    http.get('*/api/v1/coupons', ({ request }) => {
      const lectureId = Number(
        new URL(request.url).searchParams.get('lectureId'),
      )
      return (
        failure('GET /coupons') ?? rs(state.lectureCoupons[lectureId] ?? [])
      )
    }),
  )
  return state
}
