/**
 * 지급 실패 코드 설명. BE lecture PayoutFailure 분류 기준:
 * - 지갑 없음(WALLET_NOT_FOUND)을 뺀 billing 업무 오류와 지급액 불일치는 영구 실패라 격리된다
 * - 지갑 없음과 그 밖의 예외(DB 충돌 등, 예외 클래스 이름이 남는다)는 일시 실패라 다음 배치에서 다시 시도한다
 */
const KNOWN: Record<string, string> = {
  PAYOUT_ALREADY_SETTLED: '이미 지급된 항목이에요',
  PAYOUT_AMOUNT_MISMATCH: '지급액이 주문 금액과 맞지 않아요',
  PAYOUT_AMOUNT_EXCEEDS_HELD: '지급액이 남은 보류 HP보다 많아요',
  PAYOUT_SOURCE_MISMATCH: '지급 원천이 보류의 거래 대상과 맞지 않아요',
  PAYOUT_TO_PAYER: '보류한 회원(구매자) 자신에게 지급하려 했어요',
  HOLD_ALREADY_CLOSED: '남은 보류 HP가 없어요(이미 정산·반환됨)',
  HOLD_NOT_FOUND: 'HP 보류를 찾을 수 없어요',
  WALLET_NOT_FOUND:
    '판매자 지갑이 없어요(일시) — 지갑이 생기면 다음 배치에서 지급돼요',
}

/** 사람이 읽을 설명. 모르는 업무 오류 코드(대문자_밑줄)는 원문, 예외 클래스 이름은 일시 오류로 보여 준다 */
export function payoutFailureLabel(code: string) {
  const known = KNOWN[code]
  if (known) return known
  // 예외 클래스 이름(예: ObjectOptimisticLockingFailureException)은 일시 오류다.
  if (!/^[A-Z0-9_]+$/.test(code)) return `일시 오류 (${code})`
  return code
}
