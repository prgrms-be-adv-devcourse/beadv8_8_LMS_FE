import type { AppearanceRequestInput, AppearanceRequestStatus } from './types'

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

/**
 * 출연 요청서 입력 검사. 날짜는 datetime-local 값(KST)이라 문자열로 비교한다.
 * 최종 검사는 BE가 하고, 여기서는 보내기 전에 알려 주기만 한다.
 */
export function validateRequestForm(
  values: RequestFormValues,
  nowLocal: string,
): RequestFormErrors {
  const errors: RequestFormErrors = {}
  const title = values.title.trim()
  if (!title) errors.title = '제목을 입력해 주세요.'
  else if (title.length > TITLE_MAX)
    errors.title = `제목은 ${TITLE_MAX}자 이하로 써 주세요.`

  const urlError = hostChannelUrlError(values.hostChannelUrl.trim())
  if (urlError) errors.hostChannelUrl = urlError

  if (!values.content.trim()) errors.content = '요청 내용을 입력해 주세요.'
  else if (values.content.length > CONTENT_MAX)
    errors.content = `요청 내용은 ${CONTENT_MAX.toLocaleString()}자 이하로 써 주세요.`

  const fee = Number(values.fee)
  if (!values.fee || !Number.isInteger(fee) || fee < MINIMUM_FEE)
    errors.fee = `최저 출연료는 ${MINIMUM_FEE.toLocaleString()} HP예요.`

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

  if (!values.acceptDeadline) errors.acceptDeadline = '수락 기한을 정해 주세요.'
  else if (values.acceptDeadline <= nowLocal)
    errors.acceptDeadline = '수락 기한은 지금 이후여야 해요.'
  else if (values.scheduledAt && values.acceptDeadline >= values.scheduledAt)
    errors.acceptDeadline = '수락 기한은 방송 예정 일시보다 앞서야 해요.'

  return errors
}

/** 끝난(더 응답할 수 없는) 요청서 */
export function isRequestEnded(status: AppearanceRequestStatus) {
  return status !== 'REQUESTED' && status !== 'HOLD_PENDING'
}
