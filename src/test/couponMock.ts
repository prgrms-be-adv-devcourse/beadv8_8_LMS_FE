import { http, HttpResponse } from 'msw'
import type {
  Coupon,
  CouponCreateInput,
  CouponQuote,
  CouponSelection,
  CouponStatus,
  CouponSummary,
  CouponType,
  IssueStatus,
  MemberCoupon,
  QuoteCoupon,
  QuoteItem,
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

/** 미리보기 결과의 쿠폰 한 장. discount만 주면 종류에 따라 부담 몫(판매자·플랫폼)을 채운다 */
export const quoteCoupon = (
  patch: Partial<QuoteCoupon> & { memberCouponId: number },
): QuoteCoupon => {
  const couponType: CouponType = patch.couponType ?? 'SELLER'
  const discount = patch.discount ?? 0
  return {
    couponId: patch.memberCouponId,
    couponType,
    applyOrder: couponType === 'SELLER' ? 1 : 2,
    baseAmount: 0,
    discount,
    platformAmount: couponType === 'PLATFORM' ? discount : 0,
    sellerAmount: couponType === 'SELLER' ? discount : 0,
    expectedGeneration: 1,
    policyVersion: 1,
    ...patch,
  }
}

/**
 * 미리보기 결과(BE CouponCalculateResponse). 강의별 가격과 쓴 쿠폰만 주면 할인·결제액·지급액·합계를 BE 식대로 채운다
 * (할인 = 쿠폰 할인 합, 결제액 = 가격 − 할인, 지급액 = 가격 − 판매자 부담).
 */
export const couponQuote = (
  items: { lectureId: number; price: number; coupons?: QuoteCoupon[] }[],
  flags: { recommended?: boolean; optimal?: boolean } = {},
): CouponQuote => {
  const full: QuoteItem[] = items.map(({ lectureId, price, coupons = [] }) => {
    const sum = (pick: (c: QuoteCoupon) => number) =>
      coupons.reduce((total, c) => total + pick(c), 0)
    const discount = sum((c) => c.discount)
    const sellerDiscount = sum((c) => c.sellerAmount)
    return {
      lectureId,
      price,
      discount,
      platformDiscount: sum((c) => c.platformAmount),
      sellerDiscount,
      buyerAmount: price - discount,
      sellerPayout: price - sellerDiscount,
      coupons,
    }
  })
  return {
    recommended: flags.recommended ?? false,
    optimal: flags.optimal ?? false,
    items: full,
    totalDiscount: full.reduce((t, i) => t + i.discount, 0),
    totalBuyerAmount: full.reduce((t, i) => t + i.buyerAmount, 0),
  }
}

/** 미리보기 요청 본문 */
export type QuoteRequest = {
  lectureIds: number[]
  selections: CouponSelection[] | null
}

/** 미리보기 응답 차례 한 칸. 함수면 요청을 보고 결과나 오류 응답을 만든다 */
export type QuoteReply =
  CouponQuote | ((request: QuoteRequest) => CouponQuote | Response)

const emptyLecturePage = (size: number) =>
  rs({
    content: [],
    page: { size, number: 0, totalElements: 0, totalPages: 0 },
  })

/**
 * 쿠폰 화면 테스트가 다루지 않는 곁 요청(구매 목록·내 강의·판매 내역)을 빈 페이지로 받는다.
 * 핸들러가 없으면 MSW 경고가 나고, 늦게 끝난 요청이 다음 테스트 로그에 섞인다. beforeEach에서 부르고,
 * 테스트가 직접 넣는 핸들러(server.use)가 앞에 붙으므로 그쪽이 우선한다.
 */
export function quietLectureRequests() {
  server.use(
    http.get('*/api/v1/lectures/purchased', () => emptyLecturePage(100)),
    http.get('*/api/v1/lectures/me', () => emptyLecturePage(20)),
    http.get('*/api/v1/lectures/sales', () => emptyLecturePage(20)),
  )
}

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
  /** 강의별로 지금 쓸 수 있는 내 쿠폰(GET /coupons/me/usable?lectureId=). 키는 강의 ID */
  usable: Record<number, MemberCoupon[]>
  /** 쿠폰 정책 종류(GET /coupons/{couponId}의 type). 키는 쿠폰 ID. 없는 쿠폰은 404 */
  couponTypes: Record<number, CouponType>
  /**
   * 미리보기 응답 차례. 부를 때마다 앞에서 하나씩 쓰고, 마지막 값은 계속 쓴다.
   * 비어 있으면 쿠폰 없이 가격만 담은 결과(가격은 quotePrices, 없으면 0)
   */
  quotes: QuoteReply[]
  /** 기본 미리보기의 강의 가격. 키는 강의 ID */
  quotePrices: Record<number, number>
  /** 받은 미리보기 요청(순서대로) */
  quoteRequests: QuoteRequest[]
  /** 쿠폰 상세 요청 수(키: 쿠폰 ID). 종류를 캐시로 다시 쓰는지 본다 */
  detailCalls: Record<number, number>
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
    usable: {},
    couponTypes: {},
    quotes: [],
    quotePrices: {},
    quoteRequests: [],
    detailCalls: {},
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
    http.get('*/api/v1/coupons/me/usable', ({ request }) => {
      const lectureId = Number(
        new URL(request.url).searchParams.get('lectureId'),
      )
      return (
        failure(`GET /coupons/me/usable?lectureId=${lectureId}`) ??
        rs(state.usable[lectureId] ?? [])
      )
    }),
    http.post('*/api/v1/coupons/me/quote', async ({ request }) => {
      const body = (await request.json()) as QuoteRequest
      // 생략한 selections는 null(추천)로 기록한다.
      const quoteRequest: QuoteRequest = {
        lectureIds: body.lectureIds,
        selections: body.selections ?? null,
      }
      state.quoteRequests.push(quoteRequest)
      const failed = failure('POST /coupons/me/quote')
      if (failed) return failed
      const reply =
        state.quotes.length > 1 ? state.quotes.shift()! : state.quotes[0]
      if (reply === undefined)
        return rs(
          couponQuote(
            quoteRequest.lectureIds.map((lectureId) => ({
              lectureId,
              price: state.quotePrices[lectureId] ?? 0,
            })),
            { recommended: quoteRequest.selections === null },
          ),
        )
      const result = typeof reply === 'function' ? reply(quoteRequest) : reply
      return result instanceof Response ? result : rs(result)
    }),
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
    // 쿠폰 정책 한 장(종류 확인용). me·seller·admin 경로 뒤에 둔다.
    http.get('*/api/v1/coupons/:couponId', ({ params }) => {
      const couponId = Number(params.couponId)
      state.detailCalls[couponId] = (state.detailCalls[couponId] ?? 0) + 1
      const type = state.couponTypes[couponId]
      return type
        ? rs(couponSummary({ couponId, type }))
        : couponProblem(404, 'COUPON_NOT_FOUND', '쿠폰을 찾을 수 없습니다.')
    }),
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
