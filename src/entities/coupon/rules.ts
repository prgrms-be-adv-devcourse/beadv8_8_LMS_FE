import { formatDate, formatDateTime, parseServerDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { lookup, UNKNOWN_NAME } from '@/shared/lib/statusLabel'
import type {
  CouponCreateInput,
  CouponStatus,
  CouponTargetType,
  DiscountType,
  ExpiryType,
  MemberCouponStatus,
} from './types'

/** 쿠폰 이름 최대 길이(BE 1~50자) */
export const COUPON_NAME_MAX = 50
/** 정률 할인 범위(퍼센트) */
export const RATE_MIN = 1
export const RATE_MAX = 100
/** 발급일 + N일 만료의 N 범위 */
export const EXPIRY_DAYS_MIN = 1
export const EXPIRY_DAYS_MAX = 3650
const DAY_MS = 24 * 60 * 60 * 1000
/** 반려 사유 최대 길이 */
export const REJECT_REASON_MAX = 500

/**
 * BE가 새로 더한, 이 화면이 모르는 종류 값의 이름. 기존 종류로 단정하지 않고 '알 수 없음'으로 보이며,
 * 개발 중에는 lookup이 콘솔 경고를 한 번 남긴다(빈 표에서 찾으므로 늘 대체 이름이 된다)
 */
const unknownName = (value: string): string =>
  lookup<string>({}, value) ?? UNKNOWN_NAME

type DiscountFields = {
  discountType: DiscountType
  discountValue: number
  maxDiscountAmount: number | null
}

/**
 * 할인: 정률 '10% 할인'(최대 할인이 있으면 '10% 할인 · 최대 5,000 HP'), 정액 '3,000 HP 할인'.
 * BE가 새 할인 종류를 더하면 기존 종류로 단정하지 않고 '알 수 없음'으로 보인다
 */
export function discountLabel({
  discountType,
  discountValue,
  maxDiscountAmount,
}: DiscountFields) {
  if (discountType === 'AMOUNT') return `${formatNumber(discountValue)} HP 할인`
  if (discountType !== 'RATE') return unknownName(discountType)
  return maxDiscountAmount === null
    ? `${discountValue}% 할인`
    : `${discountValue}% 할인 · 최대 ${formatNumber(maxDiscountAmount)} HP`
}

/** 쿠폰 정책의 만료 방식: '받은 날부터 30일' / '11/30(일)까지' */
export function expiryRuleLabel({
  expiryType,
  expiryDays,
  fixedExpiresAt,
}: {
  expiryType: ExpiryType
  expiryDays: number | null
  fixedExpiresAt: string | null
}) {
  if (expiryType === 'RELATIVE')
    return expiryDays === null ? '받은 날부터' : `받은 날부터 ${expiryDays}일`
  if (expiryType === 'FIXED')
    return fixedExpiresAt
      ? `${formatDate(fixedExpiresAt)}까지`
      : '정해진 날까지'
  // 모르는 만료 방식은 기존 방식으로 단정하지 않는다.
  return unknownName(expiryType)
}

/** 대상: 모든 강의 / 특정 강의(제목은 부르는 쪽이 강의 조회로 채운다) */
export function targetLabel(
  targetType: CouponTargetType,
  lectureTitle?: string,
) {
  if (targetType === 'ANY_LECTURE') return '모든 강의'
  if (targetType === 'LECTURE') return lectureTitle ?? '특정 강의'
  // 모르는 대상 종류는 특정 강의로 단정하지 않는다.
  return unknownName(targetType)
}

/** 남은 수량(음수는 0) */
export function remainingOf({
  quantity,
  issuedCount,
}: {
  quantity: number
  issuedCount: number
}) {
  return Math.max(0, quantity - issuedCount)
}

/** 발급 기간: '11/8(토) 10:00 ~ 11/30(일) 23:59' */
export function issuePeriodLabel({
  issueStartAt,
  issueEndAt,
}: {
  issueStartAt: string
  issueEndAt: string
}) {
  return `${formatDateTime(issueStartAt)} ~ ${formatDateTime(issueEndAt)}`
}

/** 쿠폰함 상태 배지 [tone, 문구] */
export const MEMBER_COUPON_STATUS: Record<
  MemberCouponStatus,
  [tone: string, label: string]
> = {
  AVAILABLE: ['ok', '사용 가능'],
  RESERVED: ['warn', '사용 중'],
  USED: ['mute', '사용 완료'],
  EXPIRED: ['mute', '만료'],
}

/** 쿠폰(정책) 상태 배지 [tone, 문구] */
export const COUPON_STATUS: Record<
  CouponStatus,
  [tone: string, label: string]
> = {
  DRAFT: ['line', '신청됨'],
  REVIEW: ['warn', '심사 중'],
  REJECTED: ['bad', '반려'],
  OPEN: ['ok', '발급 중'],
  SUSPENDED: ['mute', '발급 중단'],
  CLOSED: ['mute', '종료'],
}

// ── 생성 폼(판매자 신청·관리자 생성 공용) ──

/** 폼 입력값. 숫자·일시는 입력 그대로(문자열), 일시는 datetime-local(KST) */
export type CouponFormValues = {
  name: string
  targetType: CouponTargetType
  /** 강의 ID(문자열, 선택 상자 값) */
  lectureId: string
  discountType: DiscountType
  discountValue: string
  maxDiscountAmount: string
  quantity: string
  issueStartAt: string
  issueEndAt: string
  expiryType: ExpiryType
  expiryDays: string
  fixedExpiresAt: string
  stackable: boolean
}

export type CouponFormErrors = Partial<Record<keyof CouponFormValues, string>>

/** ANY_LECTURE + RATE면 최대 할인 HP가 필요하다(BE 규칙) */
export const needsMaxDiscount = (
  targetType: CouponTargetType,
  discountType: DiscountType,
) => targetType === 'ANY_LECTURE' && discountType === 'RATE'

const positiveInt = (value: string) =>
  /^\d+$/.test(value.trim()) && Number(value) > 0

/** datetime-local 입력값(KST)을 BE Instant(ISO-8601 UTC)로 */
export function kstInputToInstant(localInput: string) {
  const seconds = localInput.length === 16 ? `${localInput}:00` : localInput
  return new Date(`${seconds}+09:00`).toISOString()
}

/**
 * 입력 일시(KST)의 시각(ms). 비었거나 날짜가 아니면(연도 다섯 자리 등) NaN이라 검증 오류가 된다.
 * toISOString은 잘못된 날짜에 예외를 던지므로 여기서는 쓰지 않는다(렌더마다 검증한다)
 */
const instantMs = (localInput: string) => {
  if (!localInput) return NaN
  const seconds = localInput.length === 16 ? `${localInput}:00` : localInput
  return parseServerDate(`${seconds}+09:00`).getTime()
}

/**
 * BE와 같은 규칙만 미리 본다(최종 판단은 BE). 이름 1~50자, 대상 강의(LECTURE), 정률 1~100 정수·정액 1 이상,
 * 모든 강의 정률이면 최대 할인 필수, 수량 1 이상, 발급 시작 < 종료이고 종료는 지금보다 뒤, 만료는 발급일 + 1~3650일
 * 또는 발급 종료보다 뒤의 고정 시각
 */
export function validateCouponForm(
  values: CouponFormValues,
  now = Date.now(),
): CouponFormErrors {
  const errors: CouponFormErrors = {}
  const name = values.name.trim()
  // BE는 앞뒤 공백을 지운 뒤 코드 포인트 수로 센다(이모지 한 개 = 1자).
  if (!name) errors.name = '쿠폰 이름을 입력해 주세요.'
  else if ([...name].length > COUPON_NAME_MAX)
    errors.name = `쿠폰 이름은 ${COUPON_NAME_MAX}자까지 쓸 수 있어요.`

  if (values.targetType === 'LECTURE' && !values.lectureId)
    errors.lectureId = '쿠폰을 쓸 강의를 골라 주세요.'

  if (values.discountType === 'RATE') {
    const rate = Number(values.discountValue)
    if (
      !/^\d+$/.test(values.discountValue.trim()) ||
      rate < RATE_MIN ||
      rate > RATE_MAX
    )
      errors.discountValue = `할인율은 ${RATE_MIN}~${RATE_MAX} 사이 정수로 입력해 주세요.`
  } else if (!positiveInt(values.discountValue)) {
    errors.discountValue = '할인 HP는 1 이상 정수로 입력해 주세요.'
  }

  if (
    needsMaxDiscount(values.targetType, values.discountType) &&
    !positiveInt(values.maxDiscountAmount)
  )
    errors.maxDiscountAmount =
      '모든 강의에 쓰는 정률 쿠폰은 최대 할인 HP를 입력해 주세요.'

  if (!positiveInt(values.quantity))
    errors.quantity = '수량은 1 이상 정수로 입력해 주세요.'

  const start = instantMs(values.issueStartAt)
  const end = instantMs(values.issueEndAt)
  if (Number.isNaN(start)) errors.issueStartAt = '발급 시작 일시를 골라 주세요.'
  if (Number.isNaN(end)) errors.issueEndAt = '발급 종료 일시를 골라 주세요.'
  else if (!Number.isNaN(start) && start >= end)
    errors.issueEndAt = '발급 종료는 시작보다 뒤여야 해요.'
  else if (end <= now) errors.issueEndAt = '발급 종료는 지금보다 뒤여야 해요.'

  if (values.expiryType === 'RELATIVE') {
    const days = Number(values.expiryDays)
    if (
      !/^\d+$/.test(values.expiryDays.trim()) ||
      days < EXPIRY_DAYS_MIN ||
      days > EXPIRY_DAYS_MAX
    )
      errors.expiryDays = `만료 일수는 ${EXPIRY_DAYS_MIN}~${formatNumber(EXPIRY_DAYS_MAX)}일 사이로 입력해 주세요.`
  } else {
    const fixed = instantMs(values.fixedExpiresAt)
    if (Number.isNaN(fixed)) errors.fixedExpiresAt = '만료 일시를 골라 주세요.'
    else if (!Number.isNaN(end) && fixed <= end)
      errors.fixedExpiresAt = '만료 일시는 발급 종료보다 뒤여야 해요.'
    else if (!Number.isNaN(end) && fixed > end + EXPIRY_DAYS_MAX * DAY_MS)
      errors.fixedExpiresAt = `만료 일시는 발급 종료 뒤 ${formatNumber(EXPIRY_DAYS_MAX)}일 안이어야 해요.`
  }
  return errors
}

/** 검증한 폼 값을 요청 본문으로. 쓰지 않는 필드는 null로 보낸다 */
export function toCouponInput(values: CouponFormValues): CouponCreateInput {
  const lecture = values.targetType === 'LECTURE'
  return {
    name: values.name.trim(),
    targetType: values.targetType,
    lectureId: lecture ? Number(values.lectureId) : null,
    discountType: values.discountType,
    discountValue: Number(values.discountValue),
    maxDiscountAmount: needsMaxDiscount(values.targetType, values.discountType)
      ? Number(values.maxDiscountAmount)
      : null,
    quantity: Number(values.quantity),
    issueStartAt: kstInputToInstant(values.issueStartAt),
    issueEndAt: kstInputToInstant(values.issueEndAt),
    expiryType: values.expiryType,
    expiryDays:
      values.expiryType === 'RELATIVE' ? Number(values.expiryDays) : null,
    fixedExpiresAt:
      values.expiryType === 'FIXED'
        ? kstInputToInstant(values.fixedExpiresAt)
        : null,
    stackable: values.stackable,
  }
}
