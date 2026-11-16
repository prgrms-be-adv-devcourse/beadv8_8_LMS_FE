import type { OrderItemStatus } from '@/entities/order/types'
import {
  lookup,
  UNKNOWN_NAME,
  UNKNOWN_STATUS_NAME,
} from '@/shared/lib/statusLabel'
import type {
  AppearanceReferenceType,
  ReconciliationApp,
  ReconciliationRule,
  ReconciliationTrigger,
} from './types'

/** 앱별 이름과 멈춘(DEAD) HP 작업을 다시 시도하는 관리자 화면 */
export const RECONCILIATION_APPS: Record<
  ReconciliationApp,
  { label: string; checked: string; hpTasks: { to: string; label: string } }
> = {
  lecture: {
    label: '강의',
    checked: '확인한 주문 항목',
    hpTasks: { to: '/admin/hp-tasks', label: '강의 HP 작업' },
  },
  appearance: {
    label: '출연',
    checked: '확인한 요청서·모집글',
    hpTasks: { to: '/admin/appearance-hp-tasks', label: '출연 HP 작업' },
  },
}

const RULE_NAME: Record<ReconciliationRule, string> = {
  HOLD_MISSING: '보류 없음',
  HOLD_MISMATCH: '보류액·보류 회원 다름',
  HOLD_BALANCE_MISMATCH: '보류 잔액 다름',
  HOLD_NOT_CLOSED: '보류 실패인데 보류 남음',
  VOIDED_WHILE_ACTIVE: '진행 중인데 무효화됨',
  SETTLEMENT_MISSING: '지급 건 없음',
  SETTLEMENT_MISMATCH: '지급 건 다름',
  SETTLEMENT_UNEXPECTED: '없어야 할 지급 건',
  WALLET_ONLY_HOLD: '지갑에만 있는 보류',
  HP_TASK_DEAD: '멈춘 작업 있음',
  HP_TASK_MISMATCH: '상태와 HP 작업 다름',
}

const TRIGGER_NAME: Record<ReconciliationTrigger, string> = {
  SCHEDULED: '매일 배치',
  MANUAL: '관리자 실행',
}

/** 관리자가 보는 주문 항목 상태. 구매자 배지(OrderItemStatusPill)와 달리 지급 단계를 나눠 보인다 */
const ITEM_STATUS_NAME: Record<OrderItemStatus, string> = {
  HOLD_PENDING: '결제 처리 중',
  HOLD_COMPENSATING: '결제 취소 처리 중',
  HOLD_FAILED: '결제 실패',
  PURCHASED: '구매(확정 전)',
  CONFIRMED: '구매 확정',
  PAYOUT_PENDING: '지급 처리 중',
  PAID_OUT: '지급 완료',
  CANCEL_PENDING: '구매 취소 처리 중',
  CANCELED: '구매 취소',
  RETURN_PENDING: '반환 처리 중',
  RETURNED: '이의 제기 인정 · 반환',
}

const REFERENCE_TYPE_NAME: Record<AppearanceReferenceType, string> = {
  APPEARANCE_REQUEST: '요청서',
  APPEARANCE_RECRUIT: '모집글',
}

export const reconciliationRuleName = (rule: string) =>
  lookup(RULE_NAME, rule) ?? UNKNOWN_NAME

export const reconciliationTriggerName = (trigger: string) =>
  lookup(TRIGGER_NAME, trigger) ?? UNKNOWN_NAME

export const reconciliationItemStatusName = (status: string) =>
  lookup(ITEM_STATUS_NAME, status) ?? UNKNOWN_STATUS_NAME

export const appearanceReferenceTypeName = (type: string) =>
  lookup(REFERENCE_TYPE_NAME, type) ?? UNKNOWN_NAME
