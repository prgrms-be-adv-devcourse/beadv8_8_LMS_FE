/**
 * HP 작업 실패 코드 설명. 마지막 실패 코드(lastErrorCode)와 시도의 오류 코드는 다음 중 하나다.
 * - 지갑 실패 코드(BE BillingFailureCode). 지갑 없음은 자동으로 다시 시도하고, 보류의 잔액 부족은 거절로 끝나며, 그 밖의 코드는 바로 멈춘다
 * - 실행기 결과: RETRYABLE·UNKNOWN_RESULT(지갑 응답을 못 받음, 자동 재시도), AMOUNT_MISMATCH·LEASE_EXPIRED·RESULT_HANDLER_MISSING(바로 멈춤)
 *   지갑 응답을 못 받았을 때의 지갑 코드(예: HP_LOCK_TIMEOUT)는 시도의 원래 코드(rawErrorCode)에 남는다
 * - HP 작업으로 옮기기 전 지급 배치의 실패 코드: PAYOUT_AMOUNT_MISMATCH 또는 예외 클래스 이름(일시 오류)
 */
const KNOWN: Record<string, string> = {
  // 지갑
  WALLET_NOT_FOUND: '지갑이 없어요(일시 오류)',
  INSUFFICIENT_BALANCE: '구매자 HP가 부족해요',
  BALANCE_OVERFLOW: '받는 지갑의 잔액이 한도를 넘어요',
  INVALID_POINT_AMOUNT: 'HP 금액이 올바르지 않아요',
  IDEMPOTENCY_KEY_CONFLICT: '같은 요청 ID로 다른 내용을 보냈어요',
  HOLD_NOT_FOUND: 'HP 보류를 찾을 수 없어요',
  HOLD_OWNER_MISMATCH: '보류한 회원이 구매자와 달라요',
  HOLD_ALREADY_CLOSED: '남은 보류 HP가 없어요(이미 정산·반환됨)',
  HOLD_TYPE_NOT_SUPPORTED: '지원하지 않는 보류 종류예요',
  HOLD_CHARGE_NOT_FOUND: '보류에 쓴 충전 내역을 찾을 수 없어요',
  HOLD_STATE_INCONSISTENT: '보류 상태가 맞지 않아요',
  CHARGE_PRINCIPAL_MISMATCH: '충전 원금이 맞지 않아요',
  HOLD_VOIDED: '보류가 무효화된 거래 대상이에요',
  RELEASE_AMOUNT_EXCEEDS_HELD: '반환액이 남은 보류 HP보다 많아요',
  PAYOUT_AMOUNT_EXCEEDS_HELD: '지급액이 남은 보류 HP보다 많아요',
  PAYOUT_TO_PAYER: '보류한 회원(구매자) 자신에게 지급하려 했어요',
  PAYOUT_SOURCE_MISMATCH: '지급 원천이 보류의 거래 대상과 맞지 않아요',
  PAYOUT_ALREADY_SETTLED: '이미 지급된 항목이에요',
  HP_LOCK_TIMEOUT: '지갑이 바빠 처리하지 못했어요(일시 오류)',
  UNMAPPED: '지갑이 알 수 없는 오류로 응답했어요',
  // 실행기
  RETRYABLE: '지갑이 처리하지 않았어요(일시 오류)',
  UNKNOWN_RESULT: '지갑이 처리했는지 알 수 없어요(일시 오류)',
  AMOUNT_MISMATCH: '지갑이 처리한 금액이 작업 금액과 달라요',
  LEASE_EXPIRED: '결과를 기록하기 전에 처리 시간이 끝났어요',
  RESULT_HANDLER_MISSING: '결과를 반영할 처리기가 없는 작업이에요',
  // HP 작업으로 옮기기 전 지급 배치
  PAYOUT_AMOUNT_MISMATCH: '지급액이 주문 금액과 맞지 않아요',
}

/**
 * 사람이 읽을 설명과 원래 코드. 원래 코드는 BE 로그·지갑 데이터와 대조할 때 쓴다.
 * 설명은 원인만 말한다. 일시 오류라도 자동 재시도 한도를 넘겨 멈춘 작업은 관리자가 재시도해야 하므로 자동 재개를 약속하지 않는다.
 * 모르는 업무 오류 코드(대문자_밑줄)는 원문, 예외 클래스 이름은 일시 오류로 보여 준다.
 */
export function hpTaskErrorLabel(code: string) {
  const known = KNOWN[code]
  if (known) return `${known} (${code})`
  // 예외 클래스 이름(예: ObjectOptimisticLockingFailureException)은 일시 오류다.
  if (!/^[A-Z0-9_]+$/.test(code)) return `일시 오류 (${code})`
  return code
}
