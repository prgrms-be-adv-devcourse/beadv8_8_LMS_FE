import { useState } from 'react'
import {
  CHARGE_INPUT_MAX_DIGITS,
  CHARGE_PRESETS,
  chargeAmountError,
} from '@/entities/wallet/charge'
import { isApiError } from '@/shared/api/ApiError'
import { formatNumber } from '@/shared/lib/money'
import { isUserCancel } from '@/shared/lib/tossPayments'
import { Field } from '@/shared/ui/Field'
import { Modal } from '@/shared/ui/Modal'
import { useStartCharge } from './useStartCharge'

type ChargeModalProps = {
  /** 결제 설정(토스페이먼츠 클라이언트 키) */
  clientKey: string
  initialAmount: number
  onClose: () => void
}

/** HP 충전: 금액을 고르고 결제하기를 누르면 충전 주문을 만들고 토스페이먼츠 결제창을 연다. */
export function ChargeModal({
  clientKey,
  initialAmount,
  onClose,
}: ChargeModalProps) {
  const [value, setValue] = useState(String(initialAmount))
  const start = useStartCharge(clientKey)
  const amount = Number(value) || 0
  const error = chargeAmountError(amount)

  return (
    <Modal
      title="HP 충전"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={error !== null || start.isPending}
            onClick={() => start.mutate(amount)}
          >
            {start.isPending ? (
              <>
                <span className="spinner sm" aria-hidden="true" />
                결제창을 여는 중…
              </>
            ) : (
              `${formatNumber(amount)}원 결제하기`
            )}
          </button>
        </>
      }
    >
      <div className="amt-chips">
        {CHARGE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={amount === preset ? 'chip on' : 'chip'}
            aria-pressed={amount === preset}
            onClick={() => setValue(String(preset))}
          >
            {formatNumber(preset)}
          </button>
        ))}
      </div>
      <Field
        id="charge-amount"
        label="충전 금액 (원)"
        error={value === '' ? undefined : (error ?? undefined)}
        hint="1,000원 단위 · 1원 = 1 HP"
      >
        <input
          id="charge-amount"
          className="input num"
          inputMode="numeric"
          value={value}
          onChange={(e) =>
            setValue(
              e.target.value
                .replace(/\D/g, '')
                .slice(0, CHARGE_INPUT_MAX_DIGITS),
            )
          }
        />
      </Field>
      <div className="breakdown">
        <div className="row sub">
          <span>결제 수단</span>
          <span>토스페이먼츠 (테스트)</span>
        </div>
        <div className="row total">
          <span>충전될 HP</span>
          <b className="num">+{formatNumber(amount)}</b>
        </div>
      </div>
      {start.error && <StartError error={start.error} />}
      <p className="fine">
        결제하기를 누르면 결제창이 열려요. 테스트 결제라 실제 금액은 청구되지
        않아요.
      </p>
    </Modal>
  )
}

function StartError({ error }: { error: unknown }) {
  if (isUserCancel(error))
    return (
      <div className="notice" role="status">
        결제를 취소했어요. 결제 금액은 청구되지 않아요.
      </div>
    )
  let message: string
  if (isApiError(error, 'CHARGE_UNAVAILABLE'))
    message = '지금은 충전할 수 없어요. 잠시 후 다시 시도해 주세요.'
  else if (isApiError(error)) message = error.message
  else message = `결제창을 열지 못했어요. ${errorMessage(error)}`
  return (
    <div className="notice bad" role="alert">
      {message}
    </div>
  )
}

/** SDK 오류는 Error가 아닐 수도 있어 message만 꺼낸다. */
function errorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' ? message : ''
}
