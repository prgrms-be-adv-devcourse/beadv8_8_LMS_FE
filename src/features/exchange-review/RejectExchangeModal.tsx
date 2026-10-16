import { useState } from 'react'
import {
  REJECTION_REASON_MAX,
  rejectionReasonError,
} from '@/entities/wallet/exchangeReview'
import type { AdminExchange } from '@/entities/wallet/types'
import { Field } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import {
  isRejectionReasonError,
  useRejectExchange,
  useReviewingExchange,
} from './useExchangeReview'

/** 거절 사유 입력. 사유는 신청자에게 보이고, 보류한 수익 HP는 신청자에게 돌아간다 */
export function RejectExchangeModal({
  exchange,
  onClose,
}: {
  exchange: AdminExchange
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const reject = useRejectExchange()
  const busy = useReviewingExchange()
  const trimmed = reason.trim()
  const localError = rejectionReasonError(reason)
  const error =
    (reason !== '' ? localError : null) ??
    (isRejectionReasonError(reject.error)
      ? '거절 사유는 앞뒤 공백을 빼고 1~500자여야 해요.'
      : null)

  return (
    <Modal
      title="환전 신청을 거절할까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={localError !== null || busy}
            onClick={() =>
              reject.mutate({
                exchangeId: exchange.exchangeId,
                reason: trimmed,
              })
            }
          >
            거절
          </button>
        </>
      }
    >
      <p>거절하면 보류한 수익 HP를 신청자에게 모두 돌려줘요.</p>
      <Field
        id="exchange-reject-reason"
        label="거절 사유"
        error={error ?? undefined}
        hint={`${trimmed.length}/${REJECTION_REASON_MAX} · 신청자에게 보여요`}
      >
        <textarea
          id="exchange-reject-reason"
          className="textarea"
          value={reason}
          aria-invalid={error !== null}
          aria-describedby={error ? 'exchange-reject-reason-error' : undefined}
          onChange={(e) => {
            if (reject.error) reject.reset()
            setReason(e.target.value)
          }}
          placeholder="예: 예금주가 신청자와 달라요"
        />
      </Field>
    </Modal>
  )
}
