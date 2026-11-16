import { lookup, UNKNOWN_NAME } from '@/shared/lib/statusLabel'
import type {
  AppearanceHpTaskReason,
  AppearanceHpTaskRefType,
  AppearanceHpTaskStatus,
  AppearanceHpTaskType,
} from './types'

/** 관리자 목록의 상태 필터. 기본은 관리자가 처리할 멈춘 작업이다. BE에 전체 조회는 없다 */
export const APPEARANCE_HP_TASK_STATUS_FILTERS = [
  { status: 'DEAD', label: '멈춤', empty: '자동 처리가 멈춘 작업이 없어요' },
  {
    status: 'PENDING',
    label: '대기',
    empty: '대기하거나 자동으로 다시 시도 중인 작업이 없어요',
  },
  { status: 'DONE', label: '완료', empty: '끝난 작업이 없어요' },
] as const satisfies readonly {
  status: AppearanceHpTaskStatus
  label: string
  empty: string
}[]

const TYPE_LABEL: Record<AppearanceHpTaskType, string> = {
  RELEASE: '반환',
  PENALTY: '위약금 정산',
  PAYOUT: '지급',
}

const REASON_LABEL: Record<AppearanceHpTaskReason, string> = {
  REQUEST_REJECTED: '요청 거절',
  REQUEST_CANCELED: '요청 취소',
  REQUEST_EXPIRED: '요청 만료',
  RECRUIT_CLOSED: '모집 마감(성립하지 못한 자리)',
  CANCEL_AGREED: '합의 취소',
  HOST_CANCELED: '호스트 취소',
  RECRUIT_CANCELED: '모집 취소(빈 자리)',
  APPEARANCE_CONFIRMED: '출연 확인',
  APPEARANCE_ABSENT: '게스트 불참',
}

const REF_LABEL: Record<AppearanceHpTaskRefType, string> = {
  APPEARANCE_REQUEST: '요청서',
  APPEARANCE_RECRUIT: '모집글',
}

/** 작업 종류 이름. 모르는 값은 알 수 없음 */
export const appearanceHpTaskTypeName = (taskType: string) =>
  lookup(TYPE_LABEL, taskType) ?? UNKNOWN_NAME

/** 작업 사유 이름. 모르는 값은 알 수 없음 */
export const appearanceHpTaskReasonName = (reason: string) =>
  lookup(REASON_LABEL, reason) ?? UNKNOWN_NAME

/** 대상 종류 이름(요청서·모집글). 모르는 값은 알 수 없음 */
export const appearanceHpTaskRefName = (refType: string) =>
  lookup(REF_LABEL, refType) ?? UNKNOWN_NAME
