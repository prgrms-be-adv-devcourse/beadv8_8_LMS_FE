/**
 * 쿠폰 API 타입. BE 계약: 생성·조작·발급 접수·상태 조회는 dev 병합된 쿠폰 3단계, 조회(목록·상세)와 이름(`name`)·
 * `rejectReason`은 동시에 만드는 BE 조회 API 계약이다(병합 전에는 테스트의 MSW로만 동작한다).
 * 시각은 BE `Instant`라 ISO-8601 UTC 문자열(`…Z`)로 오고 보낸다. 화면은 KST로 보인다(parseServerDate가 시간대를 읽는다).
 */

/** SELLER: 판매자가 자기 강의에 신청, PLATFORM: 관리자가 만든 플랫폼 쿠폰 */
export type CouponType = 'SELLER' | 'PLATFORM'

/** LECTURE: 특정 강의(lectureId), ANY_LECTURE: 모든 강의 */
export type CouponTargetType = 'LECTURE' | 'ANY_LECTURE'

/** RATE: 정률(discountValue는 1~100 퍼센트), AMOUNT: 정액(discountValue는 HP) */
export type DiscountType = 'RATE' | 'AMOUNT'

/** RELATIVE: 발급(최초 접수) 시각 + expiryDays일, FIXED: fixedExpiresAt까지 */
export type ExpiryType = 'RELATIVE' | 'FIXED'

/**
 * 쿠폰(정책) 상태
 * - DRAFT: 판매자가 신청만 함(심사 요청 전) / REVIEW: 심사 중 / REJECTED: 반려
 * - OPEN: 발급 중 / SUSPENDED: 발급 중단(이미 받은 쿠폰은 쓸 수 있다) / CLOSED: 종료
 */
export type CouponStatus =
  'DRAFT' | 'REVIEW' | 'REJECTED' | 'OPEN' | 'SUSPENDED' | 'CLOSED'

/** 회원이 받은 쿠폰 상태. AVAILABLE 사용 가능 / RESERVED 주문에 묶임 / USED 사용함 / EXPIRED 만료 */
export type MemberCouponStatus = 'AVAILABLE' | 'RESERVED' | 'USED' | 'EXPIRED'

/** 발급 접수 결과. ALREADY_ACCEPTED는 같은 요청 ID를 다시 보낸 경우(성공으로 본다) */
export type IssueResponseCode = 'ACCEPTED' | 'ALREADY_ACCEPTED'

/** 발급 요청 처리 상태 */
export type IssueStatus =
  'ISSUED' | 'REJECTED' | 'PENDING' | 'UNKNOWN' | 'NOT_FOUND'

/** 판매자·관리자가 보는 쿠폰 정책(CouponView) */
export type Coupon = {
  couponId: number
  /** 쿠폰 이름(1~50자). BE 조회 API에서 추가 */
  name: string
  type: CouponType
  applicantId: number | null
  targetType: CouponTargetType
  lectureId: number | null
  /** 신청 때 강의 가격(HP). 대상이 모든 강의면 null */
  basePrice: number | null
  discountType: DiscountType
  discountValue: number
  maxDiscountAmount: number | null
  quantity: number
  issuedCount: number
  issueStartAt: string
  issueEndAt: string
  expiryType: ExpiryType
  expiryDays: number | null
  fixedExpiresAt: string | null
  stackable: boolean
  policyVersion: number
  status: CouponStatus
  rejectReason: string | null
}

/** 회원이 강의에서 받을 수 있는 쿠폰(CouponSummaryView). BE 조회 API */
export type CouponSummary = {
  couponId: number
  name: string
  type: CouponType
  targetType: CouponTargetType
  lectureId: number | null
  discountType: DiscountType
  discountValue: number
  maxDiscountAmount: number | null
  stackable: boolean
  issueStartAt: string
  issueEndAt: string
  expiryType: ExpiryType
  expiryDays: number | null
  fixedExpiresAt: string | null
  quantity: number
  issuedCount: number
  /** 모두 소진 */
  soldOut: boolean
  /** 내가 이미 받음(접수됐지만 아직 발급 전 포함) */
  issued: boolean
  status: CouponStatus
}

/** 내 쿠폰함 한 장(MemberCouponView) */
export type MemberCoupon = {
  memberCouponId: number
  couponId: number
  /** 쿠폰 이름. BE 조회 API에서 추가 */
  couponName: string
  status: MemberCouponStatus
  issuedAt: string
  expiresAt: string
  targetType: CouponTargetType
  lectureId: number | null
  discountType: DiscountType
  discountValue: number
  maxDiscountAmount: number | null
  stackable: boolean
  /**
   * 쿠폰 종류. BE 선행 작업(회원 쿠폰 목록에 종류 추가)이 끝나기 전에는 오지 않는다.
   * 없으면 쿠폰 상세(GET /coupons/{couponId})의 `type`으로 채운다
   */
  couponType?: CouponType
}

/** 쿠폰을 쓸 강의 매핑(미리보기 selections·주문 coupons 한 줄) */
export type CouponSelection = { memberCouponId: number; lectureId: number }

/** 미리보기 결과의 쿠폰 한 장(CouponCalculateResponse.Coupon). 이름은 없다(usable의 couponName으로 맞춘다) */
export type QuoteCoupon = {
  memberCouponId: number
  couponId: number
  couponType: CouponType
  /** 같은 강의 안 적용 순서(판매자 먼저) */
  applyOrder: number
  /** 이 쿠폰을 적용하기 전 금액 */
  baseAmount: number
  discount: number
  platformAmount: number
  sellerAmount: number
  expectedGeneration: number
  policyVersion: number
}

/** 미리보기 결과의 강의 한 줄(요청 강의 순서) */
export type QuoteItem = {
  lectureId: number
  price: number
  discount: number
  platformDiscount: number
  sellerDiscount: number
  buyerAmount: number
  sellerPayout: number
  coupons: QuoteCoupon[]
}

/**
 * POST /coupons/me/quote 응답(CouponCalculateResponse). 상태를 바꾸지 않는다.
 * recommended: 추천으로 계산했다(selections 생략), optimal: 추천이 최대 할인임을 보장한다
 */
export type CouponQuote = {
  recommended: boolean
  optimal: boolean
  items: QuoteItem[]
  totalDiscount: number
  totalBuyerAmount: number
}

/** 쿠폰 생성(판매자 신청·관리자 생성) 요청 본문(CouponCreateRequest) */
export type CouponCreateInput = {
  /** 1~50자 */
  name: string
  /** 판매자는 LECTURE만 */
  targetType: CouponTargetType
  /** LECTURE면 필수 */
  lectureId: number | null
  discountType: DiscountType
  /** RATE는 1~100 정수, AMOUNT는 HP */
  discountValue: number
  /** ANY_LECTURE + RATE만 필수, 그 밖에는 null */
  maxDiscountAmount: number | null
  /** 1 이상 */
  quantity: number
  /** ISO-8601 Instant. 시작 < 종료, 종료는 지금보다 뒤 */
  issueStartAt: string
  issueEndAt: string
  expiryType: ExpiryType
  /** RELATIVE면 필수(1~3650) */
  expiryDays: number | null
  /** FIXED면 필수(발급 종료보다 뒤) */
  fixedExpiresAt: string | null
  stackable: boolean
}

/** POST /coupons/{couponId}/issue-requests 응답(202) */
export type IssueRequestResult = {
  issueRequestId: string
  couponId: number
  result: IssueResponseCode
  /** 받게 될 쿠폰의 만료 시각 */
  expiresAt: string | null
}

/** GET /coupons/{couponId}/issue-requests/{issueRequestId} */
export type IssueStatusView = {
  issueRequestId: string
  couponId: number
  status: IssueStatus
  /** REJECTED일 때의 사유. BE 조회 API에서 추가(그 전에는 없다) */
  rejectReason?: string | null
}
