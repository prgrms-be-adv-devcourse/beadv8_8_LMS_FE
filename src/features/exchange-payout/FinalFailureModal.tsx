import { FINAL_FAILURE_REASON_MAX } from '@/entities/wallet/exchangePayout'
import { applicantLabel } from '@/entities/wallet/exchangeReview'
import type { AdminExchange } from '@/entities/wallet/types'
import { ReasonField } from '@/features/admin-flow/ReasonField'
import { useReasonInput } from '@/features/admin-flow/useReasonInput'
import { formatNumber } from '@/shared/lib/money'
import { Modal } from '@/shared/ui/Modal'
import {
  isFinalFailureReasonError,
  isFinalPayoutError,
  payoutFailureMessage,
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
  const reason = useReasonInput({
    id: 'exchange-final-failure-reason',
    max: FINAL_FAILURE_REASON_MAX,
    emptyMessage: '최종 실패 사유를 입력해 주세요.',
  })
  const fail = useFailPayoutFinally(exchange.exchangeId)
  const busy = usePayoutBusy(exchange.exchangeId)
  const failure = payoutFailureMessage(fail.error, { reasonField: true })

  return (
    <Modal
      title="최종 실패로 끝낼까요?"
      onClose={onClose}
      dismissOnScrim={false}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={busy}
            {...reason.submitProps}
            onClick={() => {
              if (!reason.check()) return
              fail.mutate(reason.trimmed, {
                onSuccess: onClose,
                onError: (e) => {
                  if (isFinalPayoutError(e)) onClose()
                  else if (isFinalFailureReasonError(e))
                    reason.showServerError(
                      `최종 실패 사유는 앞뒤 공백을 빼고 1~${FINAL_FAILURE_REASON_MAX}자여야 해요.`,
                    )
                },
              })
            }}
          >
            {failure ? '다시 시도' : '최종 실패 확정'}
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
      <ReasonField
        label="최종 실패 사유"
        placeholder="예: 계좌가 해지되어 송금할 수 없어요"
        {...reason.field}
      />
      {failure && (
        <div className="notice bad" role="alert">
          최종 실패로 끝내지 못했어요. {failure}
        </div>
      )}
    </Modal>
  )
}
