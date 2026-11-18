import { applicantLabel } from '@/entities/wallet/exchangeReview'
import type { AdminExchange } from '@/entities/wallet/types'
import { formatNumber } from '@/shared/lib/money'
import { Modal } from '@/shared/ui/Modal'
import { useApproveExchange, useReviewingExchange } from './useExchangeReview'

/** 승인 확인. 승인은 보류를 유지할 뿐 송금하지 않는다(BE #294) */
export function ApproveExchangeModal({
  exchange,
  onClose,
}: {
  exchange: AdminExchange
  onClose: () => void
}) {
  const approve = useApproveExchange()
  const busy = useReviewingExchange()
  const { account } = exchange
  return (
    <Modal
      title="환전 신청을 승인할까요?"
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
            onClick={() => approve.mutate(exchange.exchangeId)}
          >
            승인
          </button>
        </>
      }
    >
      <dl className="kv">
        <dt>신청자</dt>
        <dd>{applicantLabel(exchange)}</dd>
        <dt>신청 금액</dt>
        <dd className="num">{formatNumber(exchange.requestedAmount)} HP</dd>
        <dt>예상 수령액</dt>
        <dd className="num">{formatNumber(exchange.expectedPayoutAmount)}원</dd>
        <dt>받을 계좌</dt>
        <dd>
          <span className="num">
            {account.bankCode} {account.accountNumberMasked}
          </span>{' '}
          · {account.accountHolderName}
        </dd>
      </dl>
      <p>
        승인해도 바로 송금하지 않아요. 보류한 수익 HP는 그대로 두고, 송금은 정산
        처리에서 해요. 승인한 뒤에는 회원이 신청을 취소할 수 없어요.
      </p>
    </Modal>
  )
}
