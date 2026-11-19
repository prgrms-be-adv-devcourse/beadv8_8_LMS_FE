import { REJECTION_REASON_MAX } from '@/entities/wallet/exchangeReview'
import type { AdminExchange } from '@/entities/wallet/types'
import { ReasonField } from '@/features/admin-flow/ReasonField'
import { useReasonInput } from '@/features/admin-flow/useReasonInput'
import { Modal } from '@/shared/ui/Modal'
import {
  isFinalReviewError,
  isRejectionReasonError,
  reviewFailureMessage,
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
  const reason = useReasonInput({
    id: 'exchange-reject-reason',
    max: REJECTION_REASON_MAX,
    emptyMessage: '거절 사유를 입력해 주세요.',
  })
  const reject = useRejectExchange()
  const busy = useReviewingExchange()
  const failure = reviewFailureMessage(reject.error, { reasonField: true })

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
            disabled={busy}
            {...reason.submitProps}
            onClick={() => {
              if (!reason.check()) return
              reject.mutate(
                { exchangeId: exchange.exchangeId, reason: reason.trimmed },
                {
                  onError: (e) => {
                    if (isFinalReviewError(e)) onClose()
                    else if (isRejectionReasonError(e))
                      reason.showServerError(
                        `거절 사유는 앞뒤 공백을 빼고 1~${REJECTION_REASON_MAX}자여야 해요.`,
                      )
                  },
                },
              )
            }}
          >
            {failure ? '다시 시도' : '거절'}
          </button>
        </>
      }
    >
      <p>거절하면 보류한 수익 HP를 신청자에게 모두 돌려줘요.</p>
      <ReasonField
        label="거절 사유"
        hint="신청자에게 보여요"
        placeholder="예: 예금주가 신청자와 달라요"
        {...reason.field}
      />
      {failure && (
        <div className="notice bad" role="alert">
          거절하지 못했어요. {failure}
        </div>
      )}
    </Modal>
  )
}
