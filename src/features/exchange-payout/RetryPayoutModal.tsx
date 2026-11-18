import { applicantLabel } from '@/entities/wallet/exchangeReview'
import type { AdminExchange } from '@/entities/wallet/types'
import { formatNumber } from '@/shared/lib/money'
import { Modal } from '@/shared/ui/Modal'
import { usePayoutBusy, useRetryPayout } from './useExchangePayout'
import admin from '@/pages/admin-shared.module.css'

/** 재송금 확인. 새 지급 요청 ID로 실제 송금을 다시 보내 되돌릴 수 없다 */
export function RetryPayoutModal({
  exchange,
  onClose,
}: {
  exchange: AdminExchange
  onClose: () => void
}) {
  const retry = useRetryPayout(exchange.exchangeId)
  const busy = usePayoutBusy(exchange.exchangeId)
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
            onClick={() => retry.mutate(undefined, { onSuccess: onClose })}
          >
            재송금
          </button>
        </>
      }
    >
      <dl className={`kv ${admin.kv}`}>
        <dt>신청자</dt>
        <dd>{applicantLabel(exchange)}</dd>
        <dt>송금액</dt>
        <dd className="num">{formatNumber(exchange.expectedPayoutAmount)}원</dd>
      </dl>
      <p>
        은행이 실패를 확정한 송금을 새 요청으로 다시 보내요. 보낸 송금은 되돌릴
        수 없어요.
      </p>
    </Modal>
  )
}
