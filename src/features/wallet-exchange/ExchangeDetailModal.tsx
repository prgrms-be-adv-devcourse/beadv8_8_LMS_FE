import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { exchangeQuery } from '@/entities/wallet/api'
import { isExchangeCancelable } from '@/entities/wallet/exchange'
import { ExchangeStatusPill } from '@/entities/wallet/ui/ExchangeStatusPill'
import { isApiError } from '@/shared/api/ApiError'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import { Modal } from '@/shared/ui/Modal'
import { ExchangeSummary } from './ExchangeSummary'
import { useCancelExchange } from './useCancelExchange'

type ExchangeDetailModalProps = {
  exchangeId: number
  onClose: () => void
}

/** 환전 신청 상세(신청 당시 계좌 포함). 관리자 승인 전(REQUESTED)이면 확인을 거쳐 취소할 수 있다. */
export function ExchangeDetailModal({
  exchangeId,
  onClose,
}: ExchangeDetailModalProps) {
  const { data: exchange, error, refetch } = useQuery(exchangeQuery(exchangeId))
  const cancel = useCancelExchange()
  const [confirming, setConfirming] = useState(false)
  const cancelable =
    exchange !== undefined && isExchangeCancelable(exchange.status)

  return (
    <Modal
      title="환전 신청 상세"
      onClose={onClose}
      footer={
        cancelable && confirming ? (
          <>
            <span className="fine">
              신청을 취소할까요? 보류한 수익 HP를 모두 돌려드려요.
            </span>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setConfirming(false)}
            >
              아니요
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(exchangeId)}
            >
              {cancel.isPending && (
                <span className="spinner sm" aria-hidden="true" />
              )}
              신청 취소
            </button>
          </>
        ) : (
          <>
            {cancelable && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  cancel.reset()
                  setConfirming(true)
                }}
              >
                환전 신청 취소
              </button>
            )}
            <button type="button" className="btn" onClick={onClose}>
              닫기
            </button>
          </>
        )
      }
    >
      {error && !exchange ? (
        <LoadError error={error} retry={() => void refetch()} />
      ) : !exchange ? (
        <Loading />
      ) : (
        <>
          <div>
            <ExchangeStatusPill status={exchange.status} />
          </div>
          <ExchangeSummary exchange={exchange} />
        </>
      )}
      {cancel.error && <CancelError error={cancel.error} />}
    </Modal>
  )
}

function CancelError({ error }: { error: Error }) {
  const message = isApiError(error, 'EXCHANGE_NOT_CANCELABLE')
    ? '이미 승인 단계로 넘어가 신청을 취소할 수 없어요. 최신 상태를 다시 불러왔어요.'
    : error.message
  return (
    <div className="notice bad" role="alert">
      {message}
    </div>
  )
}
