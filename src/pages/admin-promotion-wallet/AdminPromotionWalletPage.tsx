import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import {
  fundPromotionWallet,
  promotionWalletKeys,
  promotionWalletQuery,
} from '@/entities/wallet/promotionWalletApi'
import { isApiError } from '@/shared/api/ApiError'
import { formatNumber } from '@/shared/lib/money'
import { Field } from '@/shared/ui/Field'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import { toast } from '@/shared/ui/toastStore'

const SOURCE_REF_MAX = 200
const MEMO_MAX = 500

/** 충전 작업 ID(영문·숫자·-·_). 같은 내용으로 다시 보내면 BE가 새로 충전하지 않게 입력이 바뀔 때만 새로 만든다 */
const newFundingWorkId = () =>
  `PF-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export function AdminPromotionWalletPage() {
  return (
    <div className="page">
      <PageHead
        title="프로모션 지갑"
        lede="플랫폼 쿠폰의 할인액을 대는 프로모션 HP를 충전해요. 쿠폰을 열면 가용 잔액에서 쿠폰 예산을 예약해요."
      />
      <Balance />
      <FundingForm />
    </div>
  )
}

function Balance() {
  const { data, error, isPending, refetch } = useQuery(promotionWalletQuery())
  if (isPending) return <Loading />
  if (error) return <LoadError error={error} retry={refetch} />
  return (
    <section className="bal" aria-label="프로모션 지갑 잔액">
      <div className="lbl">
        <span>가용 잔액</span>
      </div>
      <div className="amt">
        {formatNumber(data.availableHp)}
        <small>HP</small>
      </div>
      <p className="desc">
        쿠폰 예산으로 예약 {formatNumber(data.reservedHp)} HP · 주문에 보류{' '}
        {formatNumber(data.heldHp)} HP
      </p>
    </section>
  )
}

function FundingForm() {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [sourceRef, setSourceRef] = useState('')
  const [memo, setMemo] = useState('')
  const [touched, setTouched] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const workId = useRef(newFundingWorkId())

  const fund = useMutation({
    mutationFn: fundPromotionWallet,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: promotionWalletKeys.all }),
  })

  /** 입력이 바뀌면 다른 충전이므로 작업 ID를 새로 만든다 */
  const changed = () => {
    workId.current = newFundingWorkId()
    setFormError(null)
  }

  const amountHp = Number(amount)
  const amountError =
    amount === '' || amountHp < 1 ? '충전할 HP를 1 이상으로 적어 주세요.' : ''
  const sourceRefError =
    sourceRef.trim() === '' ? '충전 근거 번호를 적어 주세요.' : ''

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (fund.isPending || amountError || sourceRefError) return
    fund.mutate(
      {
        fundingWorkId: workId.current,
        amountHp,
        sourceRef: sourceRef.trim(),
        memo: memo.trim() || undefined,
      },
      {
        onSuccess: (result) => {
          toast(`${formatNumber(result.amountHp)} HP를 충전했어요.`)
          setAmount('')
          setSourceRef('')
          setMemo('')
          setTouched(false)
          workId.current = newFundingWorkId()
        },
        onError: (error) =>
          setFormError(
            isApiError(error) && error.status === 503
              ? '잠시 후 다시 시도해 주세요.'
              : error.message,
          ),
      },
    )
  }

  return (
    <section className="panel" aria-label="프로모션 지갑 충전">
      <form onSubmit={submit} noValidate>
        <div className="form-row">
          <Field
            id="pw-amount"
            label="충전 HP"
            error={touched ? amountError : undefined}
          >
            <input
              id="pw-amount"
              className="input num"
              inputMode="numeric"
              value={amount}
              onChange={(e) => {
                changed()
                setAmount(e.target.value.replace(/\D/g, ''))
              }}
            />
          </Field>
          <Field
            id="pw-source-ref"
            label="충전 근거 번호"
            error={touched ? sourceRefError : undefined}
            hint="결재 번호처럼 충전 근거를 찾을 수 있는 번호예요."
          >
            <input
              id="pw-source-ref"
              className="input"
              maxLength={SOURCE_REF_MAX}
              value={sourceRef}
              onChange={(e) => {
                changed()
                setSourceRef(e.target.value)
              }}
            />
          </Field>
        </div>
        <Field id="pw-memo" label="메모 (선택)">
          <input
            id="pw-memo"
            className="input"
            maxLength={MEMO_MAX}
            value={memo}
            onChange={(e) => {
              changed()
              setMemo(e.target.value)
            }}
          />
        </Field>
        {formError && (
          <p className="fine c-bad" role="alert">
            {formError}
          </p>
        )}
        <button type="submit" className="btn primary" disabled={fund.isPending}>
          충전하기
        </button>
      </form>
      <p className="fine">
        충전한 프로모션 HP는 회원 HP가 아니에요. 환불·환전하지 않고, 쿠폰
        할인분으로 판매자에게 지급되면 판매자의 수익 HP가 돼요.
      </p>
    </section>
  )
}
