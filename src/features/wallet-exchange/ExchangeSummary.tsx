import {
  SETTLEMENT_NOTE,
  formatSettlementDate,
} from '@/entities/wallet/exchange'
import type { Exchange } from '@/entities/wallet/types'
import { formatDateTime } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'

/**
 * 서버가 확정한 환전 신청 내용(금액·잠정 정산 예정일·신청 당시 계좌). 신청 결과와 상세에서 함께 쓴다.
 * 관리자 환전 상세(AdminExchange)도 같은 필드라 함께 쓴다.
 */
export function ExchangeSummary({
  exchange,
}: {
  exchange: Pick<
    Exchange,
    | 'requestedAmount'
    | 'feeAmount'
    | 'expectedPayoutAmount'
    | 'settlementRoundDate'
    | 'account'
    | 'requestedAt'
    | 'canceledAt'
  >
}) {
  const { account } = exchange
  return (
    <>
      <div className="breakdown">
        <div className="row sub">
          <span>신청 HP</span>
          <span className="num">{formatNumber(exchange.requestedAmount)}</span>
        </div>
        <div className="row sub">
          <span>플랫폼 수수료</span>
          <span className="num">−{formatNumber(exchange.feeAmount)}</span>
        </div>
        <div className="row total">
          <span>예상 수령액</span>
          <b className="num">{formatNumber(exchange.expectedPayoutAmount)}원</b>
        </div>
      </div>
      <dl className="kv">
        <dt>정산 예정일</dt>
        <dd>{formatSettlementDate(exchange.settlementRoundDate)} 예정</dd>
        <dt>받을 계좌</dt>
        <dd>
          <span className="num">
            {account.bankCode} {account.accountNumberMasked}
          </span>{' '}
          · {account.accountHolderName}
        </dd>
        <dt>신청 일시</dt>
        <dd>{formatDateTime(exchange.requestedAt)}</dd>
        {exchange.canceledAt && (
          <>
            <dt>취소 일시</dt>
            <dd>{formatDateTime(exchange.canceledAt)}</dd>
          </>
        )}
      </dl>
      <p className="fine">{SETTLEMENT_NOTE}</p>
    </>
  )
}
