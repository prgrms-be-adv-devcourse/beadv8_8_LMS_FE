import { isPast, parseServerDate } from '@/shared/lib/date'
import type {
  Appearance,
  AppearanceSummary,
  AppearanceRequestInput,
  AppearanceRequestStatus,
  RecruitInput,
} from './types'

/** 최저 출연료 (1인당). BE appearance.yml appearance.policy.minimum-fee */
export const MINIMUM_FEE = 20_000
/** 호스트 일방 취소 위약금 비율. 안내 문구용 (BE penalty-rate-percent) */
export const PENALTY_RATE_PERCENT = 30

// 형식 제한 (BE AppearanceRequestRules)
export const TITLE_MAX = 100
export const URL_MAX = 255
export const CONTENT_MAX = 5000
export const EXPECTED_MINUTES_MAX = 1440
export const REJECT_REASON_MAX = 500
/** 모집 인원 (BE appearance.policy.max-recruit-count) */
export const RECRUIT_COUNT_MIN = 1
export const RECRUIT_COUNT_MAX = 10
/** 지원 메시지 (선택) */
export const APPLY_MESSAGE_MAX = 500
const URL_PATTERN = /^https?:\/\/\S+$/

export type RequestFormValues = Omit<
  AppearanceRequestInput,
  'guestId' | 'fee' | 'expectedMinutes'
> & { fee: string; expectedMinutes: string }

export type RequestFormErrors = Partial<Record<keyof RequestFormValues, string>>

export function hostChannelUrlError(url: string): string | null {
  if (!URL_PATTERN.test(url) || url.length > URL_MAX)
    return '채널 주소는 http:// 또는 https://로 시작해야 해요.'
  return null
}

type SharedValues = Pick<
  RequestFormValues,
  'title' | 'hostChannelUrl' | 'content' | 'expectedMinutes' | 'scheduledAt'
>

/** 출연 요청서·모집글이 같이 쓰는 제목·채널 주소·내용·출연 시간·방송 예정 일시 검사 */
function validateShared(
  values: SharedValues,
  nowLocal: string,
  contentLabel: string,
): Partial<Record<keyof SharedValues, string>> {
  const errors: Partial<Record<keyof SharedValues, string>> = {}
  const title = values.title.trim()
  if (!title) errors.title = '제목을 입력해 주세요.'
  else if (title.length > TITLE_MAX)
    errors.title = `제목은 ${TITLE_MAX}자 이하로 써 주세요.`

  const urlError = hostChannelUrlError(values.hostChannelUrl.trim())
  if (urlError) errors.hostChannelUrl = urlError

  if (!values.content.trim())
    errors.content = `${contentLabel}을 입력해 주세요.`
  else if (values.content.length > CONTENT_MAX)
    errors.content = `${contentLabel}은 ${CONTENT_MAX.toLocaleString()}자 이하로 써 주세요.`

  const minutes = Number(values.expectedMinutes)
  if (
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > EXPECTED_MINUTES_MAX
  )
    errors.expectedMinutes = '예상 출연 시간은 1분 ~ 1,440분(24시간)이에요.'

  if (!values.scheduledAt) errors.scheduledAt = '방송 예정 일시를 정해 주세요.'
  else if (values.scheduledAt <= nowLocal)
    errors.scheduledAt = '방송 예정 일시는 지금 이후여야 해요.'
  return errors
}

/**
 * 출연 요청서 입력 검사. 날짜는 datetime-local 값(KST)이라 문자열로 비교한다.
 * 최종 검사는 BE가 하고, 여기서는 보내기 전에 알려 주기만 한다.
 */
export function validateRequestForm(
  values: RequestFormValues,
  nowLocal: string,
): RequestFormErrors {
  const errors: RequestFormErrors = validateShared(
    values,
    nowLocal,
    '요청 내용',
  )

  const fee = Number(values.fee)
  if (!values.fee || !Number.isInteger(fee) || fee < MINIMUM_FEE)
    errors.fee = `최저 출연료는 ${MINIMUM_FEE.toLocaleString()} HP예요.`

  if (!values.acceptDeadline) errors.acceptDeadline = '수락 기한을 정해 주세요.'
  else if (values.acceptDeadline <= nowLocal)
    errors.acceptDeadline = '수락 기한은 지금 이후여야 해요.'
  else if (values.scheduledAt && values.acceptDeadline >= values.scheduledAt)
    errors.acceptDeadline = '수락 기한은 방송 예정 일시보다 앞서야 해요.'

  return errors
}

export type RecruitFormValues = Omit<
  RecruitInput,
  'feePerPerson' | 'recruitCount' | 'expectedMinutes'
> & { feePerPerson: string; recruitCount: string; expectedMinutes: string }

export type RecruitFormErrors = Partial<Record<keyof RecruitFormValues, string>>

/**
 * 모집글 입력 검사. 현재 < 모집 마감 < 방송 예정이어야 한다(BE INVALID_RECRUIT_SCHEDULE).
 * 날짜는 datetime-local 값(KST)이라 문자열로 비교한다. 최종 검사는 BE가 한다.
 */
export function validateRecruitForm(
  values: RecruitFormValues,
  nowLocal: string,
): RecruitFormErrors {
  const errors: RecruitFormErrors = validateShared(
    values,
    nowLocal,
    '콘텐츠 설명',
  )

  const fee = Number(values.feePerPerson)
  if (!values.feePerPerson || !Number.isInteger(fee) || fee < MINIMUM_FEE)
    errors.feePerPerson = `1인 최저 출연료는 ${MINIMUM_FEE.toLocaleString()} HP예요.`

  const count = Number(values.recruitCount)
  if (
    !values.recruitCount ||
    !Number.isInteger(count) ||
    count < RECRUIT_COUNT_MIN ||
    count > RECRUIT_COUNT_MAX
  )
    errors.recruitCount = `모집 인원은 ${RECRUIT_COUNT_MIN}~${RECRUIT_COUNT_MAX}명이에요.`

  if (!values.recruitDeadline)
    errors.recruitDeadline = '모집 마감 일시를 정해 주세요.'
  else if (values.recruitDeadline <= nowLocal)
    errors.recruitDeadline = '모집 마감 일시는 지금 이후여야 해요.'
  else if (values.scheduledAt && values.recruitDeadline >= values.scheduledAt)
    errors.recruitDeadline = '모집 마감 일시는 방송 예정 일시보다 앞서야 해요.'

  return errors
}

/** 끝난(더 응답할 수 없는) 요청서 */
export function isRequestEnded(status: AppearanceRequestStatus) {
  return status !== 'REQUESTED' && status !== 'HOLD_PENDING'
}

/** 출연 취소 요청 사유·거절 사유·일방 취소 사유 최대 길이 (BE REASON_MAX) */
export const CANCEL_REASON_MAX = 500
/** 출연 1건당 취소 요청 횟수 (BE) */
export const CANCEL_REQUEST_LIMIT = 2

/** 호스트 일방 취소 위약금 (출연료의 30%, 원 단위 미만 버림). 안내용 계산이고 실제 금액은 BE가 정한다 */
export function penaltyOf(fee: number) {
  return Math.floor((fee * PENALTY_RATE_PERCENT) / 100)
}

/** 처리 중인 게스트 취소 요청 */
export function pendingCancelRequest(appearance: Appearance) {
  return appearance.cancelRequests.find((r) => r.status === 'REQUESTED') ?? null
}

/** 게스트가 지금 취소 요청을 보낼 수 있는지 (성립 상태, 방송 전, 요청 횟수 남음) */
export function canRequestCancel(appearance: Appearance, now = new Date()) {
  return (
    appearance.status === 'ESTABLISHED' &&
    !isPast(appearance.scheduledAt, now) &&
    appearance.cancelRequests.length < CANCEL_REQUEST_LIMIT
  )
}

/** 호스트가 지금 일방 취소할 수 있는지 (성립·취소 요청 중, 방송 전) */
export function canHostCancel(appearance: Appearance, now = new Date()) {
  return (
    (appearance.status === 'ESTABLISHED' ||
      appearance.status === 'CANCEL_REQUESTED') &&
    !isPast(appearance.scheduledAt, now)
  )
}

/** 방송 예정 일시부터 호스트가 출연 확인·불참에 응답할 수 있는 기간(일). 지나면 자동 확인 (BE appearance.policy.confirm-period) */
export const CONFIRM_PERIOD_DAYS = 7

/** 출연 확인 기한 (방송 예정 일시 + 확인 기간). 이 시각부터는 응답할 수 없고 자동 확인된다 */
export function confirmDeadline(scheduledAt: string) {
  return new Date(
    parseServerDate(scheduledAt).getTime() + CONFIRM_PERIOD_DAYS * 86_400_000,
  ).toISOString()
}

/**
 * 성립한 출연의 확인 단계: 방송 전(before) / 응답할 수 있음(open) / 기간 끝나 자동 확인 대기(ended).
 * 성립 상태가 아니면(취소 요청 처리 중·끝난 출연) null. 최종 판정은 BE가 한다.
 */
export function confirmStage(
  appearance: Pick<AppearanceSummary, 'status' | 'scheduledAt'>,
  now = new Date(),
) {
  if (appearance.status !== 'ESTABLISHED') return null
  if (!isPast(appearance.scheduledAt, now)) return 'before'
  if (!isPast(confirmDeadline(appearance.scheduledAt), now)) return 'open'
  return 'ended'
}
