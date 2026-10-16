import { useState } from 'react'
import { Link } from 'react-router'
import {
  REFUND_INPUT_MAX_DIGITS,
  defaultRefundAmount,
  refundAmountError,
} from '@/entities/wallet/refund'
import type { Refund, RefundStatus, Wallet } from '@/entities/wallet/types'
import { RefundStatusPill } from '@/entities/wallet/ui/RefundStatusPill'
import { isApiError } from '@/shared/api/ApiError'
import { formatNumber } from '@/shared/lib/money'
import { Field } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { useRefund } from './useRefund'

type RefundModalProps = {
  /** 지갑 쿼리 값. 잔액이 다시 불러와지면 검사 기준도 바뀐다. */
  wallet: Wallet
  /** 인플루언서는 수익 HP가 있다(환불 불가 안내). */
  earns: boolean
  onClose: () => void
}

/** 충전 HP 환불: 금액을 정해 신청하고, 이번 신청의 결과를 이 모달에서 보여 준다. */
export function RefundModal({ wallet, earns, onClose }: RefundModalProps) {
  const {
    refund,
    submitting,
    unknown,
    rejection,
    notFound,
    delayed,
    refreshing,
    canceling,
    cancelError,
    submit,
    refresh,
    cancel,
  } = useRefund()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [value, setValue] = useState(() =>
    String(defaultRefundAmount(wallet.chargeBalanceHp)),
  )
  const amount = Number(value) || 0
  // 응답을 놓친 신청은 이미 접수돼 충전 HP가 줄었을 수 있다. 같은 금액으로 다시 보내야 하므로 검사하지 않는다.
  const error = unknown
    ? null
    : refundAmountError(amount, wallet.chargeBalanceHp)

  if (refund)
    return (
      <Modal
        title="HP 환불"
        onClose={onClose}
        footer={
          refund.status === 'REQUESTED' && confirmCancel ? (
            <>
              <span className="fine">
                신청을 취소할까요? 보류한 HP를 모두 돌려드려요.
              </span>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setConfirmCancel(false)}
              >
                아니요
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={canceling}
                onClick={cancel}
              >
                {canceling && (
                  <span className="spinner sm" aria-hidden="true" />
                )}
                신청 취소
              </button>
            </>
          ) : (
            <>
              {refund.status === 'REQUESTED' && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setConfirmCancel(true)}
                >
                  환불 요청 취소
                </button>
              )}
              {delayed && (
                <button
                  type="button"
                  className="btn"
                  disabled={refreshing}
                  onClick={refresh}
                >
                  {refreshing && (
                    <span className="spinner sm" aria-hidden="true" />
                  )}
                  새로고침
                </button>
              )}
              <button type="button" className="btn" onClick={onClose}>
                닫기
              </button>
            </>
          )
        }
      >
        <RefundResult refund={refund} />
        {cancelError && <CancelError error={cancelError} />}
        {notFound && (
          <div className="notice bad" role="alert">
            환불 요청을 찾을 수 없어요. 지갑 잔액을 확인하고 고객센터로 문의해
            주세요.
          </div>
        )}
        {delayed && (
          <div className="notice warn" role="status">
            확인이 늦어지고 있어요. 잠시 뒤 새로고침하거나, 창을 닫고 나중에
            지갑 잔액을 확인해 주세요.
          </div>
        )}
      </Modal>
    )

  return (
    <Modal
      title="HP 환불"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={error !== null || submitting}
            onClick={() => submit(amount)}
          >
            {submitting && <span className="spinner sm" aria-hidden="true" />}
            {unknown ? '다시 시도' : `${formatNumber(amount)} HP 환불 신청`}
          </button>
        </>
      }
    >
      <div className="breakdown">
        <div className="row">
          <span>보유 HP</span>
          <b className="num">{formatNumber(wallet.availableTotalHp)} HP</b>
        </div>
        <div className="row sub">
          <span>
            <i className="dot charge" />
            충전 HP · 환불 가능
          </span>
          <span className="num">{formatNumber(wallet.chargeBalanceHp)}</span>
        </div>
        {earns && (
          <div className="row sub">
            <span>
              <i className="dot earn" />
              수익 HP · 환불 불가, 환전으로 현금화
            </span>
            <span className="num">{formatNumber(wallet.revenueBalanceHp)}</span>
          </div>
        )}
      </div>
      <Field
        id="refund-amount"
        label="환불 금액 (HP)"
        error={value === '' ? undefined : (error ?? undefined)}
        hint="충전 HP 안에서 원하는 만큼 부분 환불할 수 있어요. 1 HP = 1원"
      >
        <input
          id="refund-amount"
          className="input num"
          inputMode="numeric"
          disabled={unknown || submitting}
          value={value}
          onChange={(e) =>
            setValue(
              e.target.value
                .replace(/\D/g, '')
                .slice(0, REFUND_INPUT_MAX_DIGITS),
            )
          }
        />
      </Field>
      {rejection && !submitting && <RequestError error={rejection} />}
      {unknown && !submitting && (
        <div className="notice warn" role="status">
          응답을 받지 못했어요. 다시 시도하면 같은 신청으로 처리돼요.
        </div>
      )}
      <p className="fine">
        먼저 충전한 건부터 결제 취소돼요. 수익 HP와 거래에 보류된 HP는 환불할 수
        없어요.
      </p>
    </Modal>
  )
}

const GUIDE: Record<RefundStatus, string> = {
  COMPLETED:
    '결제 수단으로 돌려드렸어요. 카드사에 따라 취소 내역이 늦게 보일 수 있어요.',
  PARTIALLY_COMPLETED:
    '일부 결제 건만 취소됐어요. 환불하지 못한 HP는 충전 HP로 돌려놨어요.',
  FAILED:
    '결제 취소에 실패해 HP를 충전 HP로 돌려놨어요. 다시 신청하거나 고객센터로 문의해 주세요.',
  PROCESSING:
    '결제 취소 결과를 확인하고 있어요. 창을 닫아도 환불은 취소되지 않고, 결과는 지갑 잔액에 반영돼요.',
  REQUESTED:
    '환불을 접수했어요. 결제 취소를 시작하기 전까지 신청을 취소할 수 있어요.',
  MANUAL_REVIEW_REQUIRED:
    '결제 취소 결과를 운영자가 확인해야 해요. 보류 중인 HP는 확인이 끝나면 처리돼요.',
  CANCELED: '환불 신청을 취소했어요. 보류했던 HP를 충전 HP로 돌려놨어요.',
}

/** 서버가 준 금액을 그대로 보여 준다. 요청 금액 말고는 0보다 클 때만 보인다. */
function RefundResult({ refund }: { refund: Refund }) {
  return (
    <>
      <div>
        <RefundStatusPill status={refund.status} />
      </div>
      <div className="breakdown">
        <AmountRow label="요청 금액" amount={refund.requestedAmount} always />
        <AmountRow label="환불한 금액" amount={refund.completedAmount} />
        <AmountRow
          label="충전 HP로 돌려준 금액"
          amount={refund.returnedAmount}
        />
        <AmountRow label="보류 중인 금액" amount={refund.pendingAmount} />
      </div>
      <p className="fine">{GUIDE[refund.status]}</p>
      {refund.status === 'MANUAL_REVIEW_REQUIRED' && (
        <Link className="btn sm" to="/support">
          고객센터 문의
        </Link>
      )}
    </>
  )
}

function AmountRow({
  label,
  amount,
  always,
}: {
  label: string
  amount: number
  always?: boolean
}) {
  if (!always && amount <= 0) return null
  return (
    <div className={always ? 'row' : 'row sub'}>
      <span>{label}</span>
      <span className="num">{formatNumber(amount)} HP</span>
    </div>
  )
}

function CancelError({ error }: { error: Error }) {
  const message = isApiError(error, 'REFUND_NOT_CANCELABLE')
    ? '이미 결제 취소를 시작해 신청을 취소할 수 없어요. 최신 상태를 다시 불러왔어요.'
    : error.message
  return (
    <div className="notice bad" role="alert">
      {message}
    </div>
  )
}

const REQUEST_ERROR: Record<string, string> = {
  REFUND_AMOUNT_INVALID:
    '환불 금액은 1,000 HP 이상, 1,000 HP 단위로 입력해 주세요.',
  INSUFFICIENT_BALANCE:
    '환불할 수 있는 충전 HP가 부족해요. 잔액을 다시 불러왔어요.',
  REFUND_UNAVAILABLE: '지금은 환불할 수 없어요. 잠시 후 다시 시도해 주세요.',
  // 금액을 잠가 두므로 정상이라면 나오지 않는다.
  IDEMPOTENCY_KEY_CONFLICT:
    '같은 신청이 다른 금액으로 접수됐어요. 창을 닫고 다시 신청해 주세요.',
}

/** BE가 신청을 받지 않은 이유. 모르는 코드는 서버 문구를 그대로 보여 준다. */
function RequestError({ error }: { error: Error }) {
  const message =
    (isApiError(error) && REQUEST_ERROR[error.code]) || error.message
  return (
    <div className="notice bad" role="alert">
      {message}
    </div>
  )
}
