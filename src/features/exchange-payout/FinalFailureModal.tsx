import { useState } from 'react'
import {
  FINAL_FAILURE_REASON_MAX,
  finalFailureReasonError,
} from '@/entities/wallet/exchangePayout'
import { applicantLabel } from '@/entities/wallet/exchangeReview'
import type { AdminExchange } from '@/entities/wallet/types'
import { formatNumber } from '@/shared/lib/money'
import { Field } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import {
  isFinalFailureReasonError,
  useFailPayoutFinally,
  usePayoutBusy,
} from './useExchangePayout'

/** 최종 실패 확정. 환전을 끝내고 보류한 수익 HP를 신청자에게 돌려줘 되돌릴 수 없다 */
export function FinalFailureModal({
  exchange,
  onClose,
}: {
  exchange: AdminExchange
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const fail = useFailPayoutFinally(exchange.exchangeId)
  const busy = usePayoutBusy(exchange.exchangeId)
  const trimmed = reason.trim()
  const localError = finalFailureReasonError(reason)
  const error =
    (reason !== '' ? localError : null) ??
    (isFinalFailureReasonError(fail.error)
      ? '최종 실패 사유는 앞뒤 공백을 빼고 1~500자여야 해요.'
      : null)

  return (
    <Modal
      title="최종 실패로 끝낼까요?"
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
            onClick={() => fail.mutate(trimmed, { onSuccess: onClose })}
          >
            최종 실패 확정
          </button>
        </>
      }
    >
      <dl className="kv">
        <dt>신청자</dt>
        <dd>{applicantLabel(exchange)}</dd>
        <dt>돌려줄 수익 HP</dt>
        <dd className="num">{formatNumber(exchange.requestedAmount)} HP</dd>
      </dl>
      <p className="notice bad">
        환전을 끝내고 보류한 수익 HP를 신청자에게 모두 돌려줘요. 이후에는 다시
        송금할 수 없어요.
      </p>
      <Field
        id="exchange-final-failure-reason"
        label="최종 실패 사유"
        error={error ?? undefined}
        hint={`${trimmed.length}/${FINAL_FAILURE_REASON_MAX}`}
      >
        <textarea
          id="exchange-final-failure-reason"
          className="textarea"
          value={reason}
          aria-invalid={error !== null}
          aria-describedby={
            error ? 'exchange-final-failure-reason-error' : undefined
          }
          onChange={(e) => {
            if (fail.error) fail.reset()
            setReason(e.target.value)
          }}
          placeholder="예: 계좌가 해지되어 송금할 수 없어요"
        />
      </Field>
    </Modal>
  )
}
