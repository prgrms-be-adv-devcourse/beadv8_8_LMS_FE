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
import styles from './AdminPromotionWalletPage.module.css'

const SOURCE_REF_MAX = 200
const MEMO_MAX = 500

/** 충전 작업 ID(영문·숫자·-·_) */
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
    <section className={styles.slots} aria-label="프로모션 지갑 잔액">
      <div className={`${styles.slot} ${styles.main}`}>
        <span className={styles.slotLabel}>가용 잔액</span>
        <div className={styles.amt}>
          {formatNumber(data.availableHp)}
          <small>HP</small>
        </div>
        <p className="fine">새 쿠폰 예산으로 예약할 수 있는 HP예요.</p>
      </div>
      {/* 칸 이름과 금액 사이 공백은 화면 낭독·검색에서 한 문장으로 읽히게 둔다 */}
      <div className={styles.slot}>
        <span className={styles.slotLabel}>쿠폰 예산으로 예약</span>{' '}
        <b className={styles.slotAmt}>{formatNumber(data.reservedHp)} HP</b>
      </div>
      <div className={`${styles.slot} ${styles.held}`}>
        <span className={styles.slotLabel}>주문에 보류</span>{' '}
        <b className={styles.slotAmt}>{formatNumber(data.heldHp)} HP</b>
      </div>
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
  /**
   * 마지막으로 보낸 내용과 그때 쓴 충전 작업 ID. 응답을 받지 못한 요청은 BE가 처리했을 수 있으므로,
   * 보낼 내용(금액·근거 번호·메모)이 같으면 같은 ID로 다시 보내 BE가 새로 충전하지 않게 한다. 내용이 다르면 새 ID다.
   */
  const lastSent = useRef<{ key: string; workId: string } | null>(null)

  const fund = useMutation({
    mutationFn: fundPromotionWallet,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: promotionWalletKeys.all }),
  })

  const changed = () => setFormError(null)

  const amountHp = Number(amount)
  const amountError =
    amount === '' || amountHp < 1
      ? '충전할 HP를 1 이상으로 적어 주세요.'
      : !Number.isSafeInteger(amountHp)
        ? '금액이 너무 커요.'
        : ''
  const sourceRefError =
    sourceRef.trim() === '' ? '충전 근거 번호를 적어 주세요.' : ''

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (fund.isPending || amountError || sourceRefError) return
    const input = {
      amountHp,
      sourceRef: sourceRef.trim(),
      memo: memo.trim() || undefined,
    }
    const key = JSON.stringify(input)
    if (lastSent.current?.key !== key)
      lastSent.current = { key, workId: newFundingWorkId() }
    fund.mutate(
      { fundingWorkId: lastSent.current.workId, ...input },
      {
        onSuccess: (result) => {
          toast(`${formatNumber(result.amountHp)} HP를 충전했어요.`)
          setAmount('')
          setSourceRef('')
          setMemo('')
          setTouched(false)
          lastSent.current = null
        },
        // 응답을 받지 못했어도 BE가 충전했을 수 있다. 잔액은 onSettled가 다시 읽는다.
        onError: (error) =>
          setFormError(
            isApiError(error) && error.status < 500
              ? error.message
              : '충전 결과를 확인하지 못했어요. 가용 잔액을 확인하고, 늘지 않았으면 같은 내용으로 다시 충전해 주세요.',
          ),
      },
    )
  }

  return (
    <section className={`panel ${styles.fund}`} aria-label="프로모션 지갑 충전">
      <h2>충전</h2>
      <form className={styles.form} onSubmit={submit} noValidate>
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
        <div className={styles.submitRow}>
          {/* 돈이 들어가는 일이라 보낼 금액·근거를 버튼 옆에 다시 보여 주고 확인하게 한다 */}
          {!amountError && !sourceRefError && (
            <p className={styles.preview} aria-live="polite">
              <span className={styles.slotLabel}>충전할 금액</span>{' '}
              <b className="num">{formatNumber(amountHp)} HP</b>
              <span className="fine"> · 근거 {sourceRef.trim()}</span>
            </p>
          )}
          <button
            type="submit"
            className="btn primary"
            disabled={fund.isPending}
          >
            {fund.isPending && (
              <span className="spinner sm" aria-hidden="true" />
            )}
            충전하기
          </button>
        </div>
      </form>
      <p className="fine">
        충전한 프로모션 HP는 회원 HP가 아니에요. 환불·환전하지 않고, 쿠폰
        할인분으로 판매자에게 지급되면 판매자의 수익 HP가 돼요.
      </p>
    </section>
  )
}
