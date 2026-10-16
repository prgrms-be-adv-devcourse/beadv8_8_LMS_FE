import { useState } from 'react'
import { Link } from 'react-router'
import {
  ACCOUNT_NUMBER_MAX_DIGITS,
  EXCHANGE_INPUT_MAX_DIGITS,
  canExchange,
  defaultExchangeAmount,
  estimateExchangeFee,
  exchangeAccountErrors,
  exchangeAmountError,
} from '@/entities/wallet/exchange'
import type { Exchange, Wallet } from '@/entities/wallet/types'
import { ExchangeStatusPill } from '@/entities/wallet/ui/ExchangeStatusPill'
import { isApiError } from '@/shared/api/ApiError'
import { formatNumber } from '@/shared/lib/money'
import { Field } from '@/shared/ui/Field'
import { ExchangeSummary } from './ExchangeSummary'
import { useRequestExchange } from './useRequestExchange'

/** 환전 신청 폼. 신청이 접수되면 서버가 확정한 결과로 바뀐다. */
export function ExchangeRequestForm({ wallet }: { wallet: Wallet }) {
  const { exchange, submitting, unknown, rejection, submit, reset } =
    useRequestExchange()
  // 새로 신청하면 입력을 처음 값(그때의 지갑 기준)으로 되돌린다.
  const [round, setRound] = useState(0)

  if (exchange)
    return (
      <ExchangeResult
        exchange={exchange}
        onRestart={() => {
          reset()
          setRound((n) => n + 1)
        }}
      />
    )
  return (
    <ExchangeFields
      key={round}
      wallet={wallet}
      submitting={submitting}
      unknown={unknown}
      rejection={rejection}
      onSubmit={submit}
    />
  )
}

type ExchangeFieldsProps = {
  wallet: Wallet
  submitting: boolean
  unknown: boolean
  rejection: Error | null
  onSubmit: ReturnType<typeof useRequestExchange>['submit']
}

function ExchangeFields({
  wallet,
  submitting,
  unknown,
  rejection,
  onSubmit,
}: ExchangeFieldsProps) {
  const revenue = wallet.revenueBalanceHp
  const [amountText, setAmountText] = useState(() =>
    String(defaultExchangeAmount(revenue)),
  )
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [holderName, setHolderName] = useState('')
  const amount = Number(amountText) || 0
  const available = canExchange(revenue)
  // 응답을 놓친 신청은 이미 접수돼 수익 HP가 줄었을 수 있다. 같은 내용으로 다시 보내야 하므로 검사하지 않는다.
  const amountError = unknown ? null : exchangeAmountError(amount, revenue)
  const accountErrors = unknown
    ? {}
    : exchangeAccountErrors({ bankCode, accountNumber, holderName })
  const invalid = amountError !== null || Object.keys(accountErrors).length > 0
  const locked = unknown || submitting
  const fee = estimateExchangeFee(amount)

  return (
    <section className="panel">
      {!available && !unknown && (
        <div className="notice warn" role="status">
          환전할 수 있는 수익 HP가 없어요. 1,000 HP부터 신청할 수 있어요.
        </div>
      )}
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (invalid || !available) return
          onSubmit({
            amount,
            bankCode,
            accountNumber,
            accountHolderName: holderName.trim(),
          })
        }}
      >
        <Field
          id="exchange-amount"
          label="환전할 HP"
          error={amountText === '' ? undefined : (amountError ?? undefined)}
          hint={`환전 가능 ${formatNumber(revenue)} HP (출연료·강의 판매로 받은 HP) · 1,000 HP 단위`}
        >
          <input
            id="exchange-amount"
            className="input num"
            inputMode="numeric"
            disabled={locked || !available}
            value={amountText}
            onChange={(e) =>
              setAmountText(
                e.target.value
                  .replace(/\D/g, '')
                  .slice(0, EXCHANGE_INPUT_MAX_DIGITS),
              )
            }
          />
        </Field>
        <div className="breakdown">
          <div className="row sub">
            <span>신청 HP</span>
            <span className="num">{formatNumber(amount)}</span>
          </div>
          <div className="row sub">
            <span>플랫폼 수수료 10% (원 미만 버림)</span>
            <span className="num">−{formatNumber(fee)}</span>
          </div>
          <div className="row total">
            <span>예상 수령액</span>
            <b className="num">{formatNumber(amount - fee)}원</b>
          </div>
        </div>
        <Field
          id="exchange-bank"
          label="은행 코드"
          error={bankCode === '' ? undefined : accountErrors.bankCode}
          hint="숫자 3자리 (예: 004)"
        >
          <input
            id="exchange-bank"
            className="input num"
            inputMode="numeric"
            disabled={locked || !available}
            value={bankCode}
            onChange={(e) =>
              setBankCode(e.target.value.replace(/\D/g, '').slice(0, 3))
            }
          />
        </Field>
        <Field
          id="exchange-account"
          label="계좌번호"
          error={accountNumber === '' ? undefined : accountErrors.accountNumber}
          hint="숫자만 8~20자리, 하이픈 없이"
        >
          <input
            id="exchange-account"
            className="input num"
            inputMode="numeric"
            autoComplete="off"
            disabled={locked || !available}
            value={accountNumber}
            onChange={(e) =>
              setAccountNumber(
                e.target.value
                  .replace(/\D/g, '')
                  .slice(0, ACCOUNT_NUMBER_MAX_DIGITS),
              )
            }
          />
        </Field>
        <Field
          id="exchange-holder"
          label="예금주"
          error={holderName === '' ? undefined : accountErrors.holderName}
        >
          <input
            id="exchange-holder"
            className="input"
            autoComplete="off"
            disabled={locked || !available}
            value={holderName}
            onChange={(e) => setHolderName(e.target.value)}
          />
        </Field>
        {rejection && !submitting && <RequestError error={rejection} />}
        {unknown && !submitting && (
          <div className="notice warn" role="status">
            응답을 받지 못했어요. 다시 시도하면 같은 신청으로 처리돼요.
          </div>
        )}
        <p className="fine">
          신청한 HP는 바로 보류돼서 송금 전까지 쓸 수 없어요. 관리자 승인 전에는
          지갑의 환전 내역에서 신청을 취소할 수 있어요. 테스트 계좌라 실제 계좌
          확인과 송금은 하지 않아요.
        </p>
        <button
          type="submit"
          className="btn primary"
          style={{ alignSelf: 'flex-start' }}
          disabled={invalid || !available || submitting}
        >
          {submitting && <span className="spinner sm" aria-hidden="true" />}
          {unknown ? '다시 시도' : '환전 신청'}
        </button>
      </form>
    </section>
  )
}

function ExchangeResult({
  exchange,
  onRestart,
}: {
  exchange: Exchange
  onRestart: () => void
}) {
  return (
    <section className="panel result" aria-label="환전 신청 결과">
      <span className="result-ico ok" aria-hidden="true">
        ✓
      </span>
      <h2>환전을 신청했어요</h2>
      <p className="lede">
        신청한 HP는 송금 전까지 보류돼요. 관리자 승인 전에는 지갑의 환전
        내역에서 취소할 수 있어요.
      </p>
      <ExchangeStatusPill status={exchange.status} />
      <ExchangeSummary exchange={exchange} />
      <div className="result-actions">
        <Link className="btn" to="/wallet">
          지갑으로
        </Link>
        <button type="button" className="btn primary" onClick={onRestart}>
          새로 신청
        </button>
      </div>
    </section>
  )
}

const REQUEST_ERROR: Record<string, string> = {
  EXCHANGE_AMOUNT_INVALID:
    '환전 금액은 1,000 HP 이상, 1,000 HP 단위로 입력해 주세요.',
  INSUFFICIENT_BALANCE:
    '환전할 수 있는 수익 HP가 부족해요. 잔액을 다시 불러왔어요.',
  EXCHANGE_UNAVAILABLE:
    '지금은 환전을 신청할 수 없어요. 잠시 후 다시 시도해 주세요.',
  // 응답을 놓쳤을 때는 입력을 잠가 두므로 정상이라면 나오지 않는다.
  IDEMPOTENCY_KEY_CONFLICT:
    '같은 신청이 다른 내용으로 접수됐어요. 새로 신청해 주세요.',
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
