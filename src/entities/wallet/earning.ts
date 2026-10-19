import type { EarningStatus, EarningSummary, EarningType } from './types'

/** 지급 예정 수익 목록의 상태 필터. ?earning=completed|canceled, 없으면 미지급이다. */
export const EARNING_FILTERS = [
  ['unpaid', '미지급'],
  ['completed', '지급 완료'],
  ['canceled', '취소'],
] as const

export type EarningFilter = (typeof EARNING_FILTERS)[number][0]

export const EARNING_FILTER_PARAM = 'earning'

export function parseEarningFilter(value: string | null): EarningFilter {
  return value === 'completed' || value === 'canceled' ? value : 'unpaid'
}

/** BE status 파라미터. 미지급은 보내지 않는다(BE가 미지급 다섯 상태를 준다). */
export function earningStatusParam(
  filter: EarningFilter,
): EarningStatus | undefined {
  if (filter === 'completed') return 'COMPLETED'
  if (filter === 'canceled') return 'CANCELED'
  return undefined
}

export const EARNING_TYPE_LABEL: Record<EarningType, string> = {
  LECTURE_SALE: '강의 판매',
  APPEARANCE_FEE: '출연료',
  APPEARANCE_PENALTY: '위약금',
}

/** 요약의 상태별 칸 (BE 순서·문구) */
export const EARNING_SUMMARY_ROWS = [
  ['confirmationPending', '확인 대기'],
  ['scheduled', '지급 예정'],
  ['onHold', '보류'],
  ['processing', '처리 중'],
  ['failed', '실패'],
] as const satisfies readonly (readonly [
  Exclude<keyof EarningSummary, 'total' | 'asOf'>,
  string,
])[]
