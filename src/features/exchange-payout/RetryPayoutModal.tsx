import { applicantLabel } from '@/entities/wallet/exchangeReview'
import type {
  AdminExchange,
  AdminExchangePayout,
} from '@/entities/wallet/types'
import { formatNumber } from '@/shared/lib/money'
import { Modal } from '@/shared/ui/Modal'
import {
  isFinalPayoutError,
  payoutFailureMessage,
  usePayoutBusy,
  useRetryPayout,
} from './useExchangePayout'

/**
 * 재송금 확인. 새 지급 요청 ID로 실제 송금을 다시 보내 되돌릴 수 없다.
 * 받을 계좌와 직전 시도의 실패 사유를 보여 줘 같은 원인으로 다시 보내지 않게 한다.
 */
export function RetryPayoutModal({
  exchange,
  latest,
  onClose,
}: {
  exchange: AdminExchange
  /** 직전 송금 시도 */
  latest: AdminExchangePayout | null
  onClose: () => void
}) {
  const retry = useRetryPayout(exchange.exchangeId)
  const busy = usePayoutBusy(exchange.exchangeId)
  const failure = payoutFailureMessage(retry.error)
  const { account } = exchange
  return (
    <Modal
      title="송금을 다시 보낼까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() =>
              retry.mutate(undefined, {
                onSuccess: onClose,
                onError: (e) => {
                  if (isFinalPayoutError(e)) onClose()
                },
              })
            }
          >
            {failure ? '다시 시도' : '재송금'}
          </button>
        </>
      }
    >
      <dl className="kv">
        <dt>신청자</dt>
        <dd>{applicantLabel(exchange)}</dd>
        <dt>송금액</dt>
        <dd className="num">{formatNumber(exchange.expectedPayoutAmount)}원</dd>
        <dt>받을 계좌</dt>
        <dd>
          <span className="num">
            {account.bankCode} {account.accountNumberMasked}
          </span>{' '}
          · {account.accountHolderName}
        </dd>
        <dt>직전 실패 사유</dt>
        <dd>{latest?.failureReason ?? '사유가 남지 않았어요'}</dd>
      </dl>
      <p className="notice warn">
        은행이 실패를 확정한 송금을 새 요청으로 다시 보내요. 보낸 송금은 되돌릴
        수 없어요. 직전 실패 사유가 계좌 문제면 다시 보내도 실패할 수 있어요.
      </p>
      {failure && (
        <div className="notice bad" role="alert">
          재송금하지 못했어요. {failure}
        </div>
      )}
    </Modal>
  )
}
