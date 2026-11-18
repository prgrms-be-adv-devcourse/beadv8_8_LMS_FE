import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { cartQuery } from '@/entities/cart/api'
import { walletQuery } from '@/entities/wallet/api'
import {
  parseChargeAmountParam,
  parseChargeReturn,
  type ChargeReturn,
} from '@/entities/wallet/charge'
import {
  useChargeConfirm,
  type ChargeFailure,
} from '@/features/wallet-charge/useChargeConfirm'
import { formatNumber } from '@/shared/lib/money'
import styles from './ChargeResultPage.module.css'

const USER_CANCELED = 'PAY_PROCESS_CANCELED'

/**
 * 토스페이먼츠 결제창이 돌아오는 화면. 성공(paymentKey·orderId·amount)이면 승인을 요청하고,
 * 실패(code·message·orderId, 우리가 붙인 amount)면 사유만 보여 준다. 실패한 주문은 조회하지 않는다.
 */
export function ChargeResultPage() {
  const [params] = useSearchParams()
  const result = parseChargeReturn(params)
  if (!result) return <Navigate to="/wallet" replace />
  return (
    <div className="page narrow">
      {result.kind === 'success' ? (
        <ConfirmResult result={result} />
      ) : result.code === USER_CANCELED ? (
        <ResultPanel
          tone="mute"
          title="결제를 취소했어요"
          text="결제창을 닫아 충전하지 않았어요. 결제 금액은 청구되지 않아요."
          amount={result.amount}
          orderId={result.orderId}
          actions={<RetryActions amount={result.amount} />}
        />
      ) : (
        <FailedPanel
          amount={result.amount}
          orderId={result.orderId}
          failure={{
            code: result.code,
            pgCode: null,
            message: result.message ?? '',
          }}
        />
      )}
      <p className={`fine ${styles.note}`}>
        테스트 결제라 실제 금액은 청구되지 않아요.
      </p>
    </div>
  )
}

function ConfirmResult({
  result,
}: {
  result: Extract<ChargeReturn, { kind: 'success' }>
}) {
  const { paymentKey, orderId, amount } = result
  const state = useChargeConfirm({ paymentKey, orderId, amount })

  switch (state.phase) {
    case 'confirming':
      return (
        <ResultPanel
          tone="wait"
          title="결제를 확인하고 있어요"
          text="토스페이먼츠에 결제 승인을 요청했어요. 몇 초면 끝나요. 이 화면을 닫지 마세요."
          amount={amount}
          orderId={orderId}
        />
      )
    case 'delayed':
      return (
        <ResultPanel
          tone="wait"
          title="확인이 늦어지고 있어요"
          text="결제 승인 결과를 아직 받지 못했어요. 지갑에서 다시 확인해 주세요. 승인되면 HP가 충전되고, 승인되지 않으면 청구되지 않아요."
          amount={amount}
          orderId={orderId}
          actions={
            <Link className="btn primary" to="/wallet">
              지갑으로
            </Link>
          }
        />
      )
    case 'failed':
      return (
        <FailedPanel
          amount={amount}
          orderId={orderId}
          failure={state.failure}
        />
      )
    case 'completed':
      return <CompletedPanel amount={state.order.amount} orderId={orderId} />
  }
}

function CompletedPanel({
  amount,
  orderId,
}: {
  amount: number
  orderId: string
}) {
  const { data: wallet } = useQuery(walletQuery)
  const { data: cart } = useQuery(cartQuery)
  const hasCart = (cart?.items.length ?? 0) > 0
  return (
    <ResultPanel
      tone="ok"
      title={`${formatNumber(amount)} HP를 충전했어요`}
      text="바로 강의를 사거나 출연료로 쓸 수 있어요."
      amount={amount}
      orderId={orderId}
      rows={
        <div className="row total">
          <span>보유 HP</span>
          <b className="num">
            {wallet ? `${formatNumber(wallet.availableTotalHp)} HP` : '…'}
          </b>
        </div>
      }
      actions={
        <>
          {hasCart && (
            <Link className="btn primary" to="/cart">
              장바구니로
            </Link>
          )}
          <Link className={hasCart ? 'btn' : 'btn primary'} to="/wallet">
            지갑으로
          </Link>
        </>
      }
    />
  )
}

function FailedPanel({
  amount,
  orderId,
  failure,
}: {
  amount: number | null
  orderId: string | null
  failure: ChargeFailure
}) {
  return (
    <ResultPanel
      tone="bad"
      title="결제가 승인되지 않았어요"
      text={`${failure.message ? `${failure.message} ` : ''}HP는 충전되지 않았고 결제 금액도 청구되지 않아요.`}
      amount={amount}
      orderId={orderId}
      rows={
        <>
          {failure.code && (
            <div className="row sub">
              <span>실패 코드</span>
              <span className="num">{failure.code}</span>
            </div>
          )}
          {failure.pgCode && (
            <div className="row sub">
              <span>PG 코드</span>
              <span className="num">{failure.pgCode}</span>
            </div>
          )}
        </>
      }
      actions={<RetryActions amount={amount} />}
    />
  )
}

/** 같은 금액으로 새 주문을 만들어 다시 결제한다(실패한 주문은 다시 쓸 수 없다). */
function RetryActions({ amount }: { amount: number | null }) {
  const retry =
    amount !== null && parseChargeAmountParam(String(amount)) !== null
      ? `/wallet?charge=${amount}`
      : '/wallet'
  return (
    <>
      <Link className="btn primary" to={retry}>
        다시 결제하기
      </Link>
      <Link className="btn" to="/wallet">
        지갑으로
      </Link>
    </>
  )
}

type ResultPanelProps = {
  tone: 'ok' | 'bad' | 'mute' | 'wait'
  title: string
  text: string
  amount: number | null
  orderId: string | null
  rows?: ReactNode
  actions?: ReactNode
}

const ICON: Record<ResultPanelProps['tone'], ReactNode> = {
  ok: (
    <svg className={styles.check} viewBox="0 0 24 24" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  bad: '!',
  mute: '×',
  wait: <span className="spinner" />,
}

function ResultPanel({
  tone,
  title,
  text,
  amount,
  orderId,
  rows,
  actions,
}: ResultPanelProps) {
  return (
    <section
      className={`panel result ${styles.result} ${styles[tone]}`}
      aria-busy={tone === 'wait' && !actions}
    >
      <span className={`result-ico ${tone} ${styles.ico}`} aria-hidden="true">
        {ICON[tone]}
      </span>
      <h1 className={styles.title}>{title}</h1>
      <p className={`lede ${styles.text}`}>{text}</p>
      <div className={`breakdown ${styles.receipt}`}>
        {amount !== null && (
          <div className="row sub">
            <span>결제 금액</span>
            <span className="num">{formatNumber(amount)}원</span>
          </div>
        )}
        <div className="row sub">
          <span>결제 수단</span>
          <span>토스페이먼츠 (테스트)</span>
        </div>
        {orderId && (
          <div className={`row sub ${styles.orderRow}`}>
            <span>주문 번호</span>
            <span className={styles.orderCell}>
              <span className={`num order-id ${styles.orderId}`}>
                {orderId}
              </span>
              <CopyButton text={orderId} />
            </span>
          </div>
        )}
        {rows}
      </div>
      {actions && <div className="result-actions">{actions}</div>}
    </section>
  )
}

/** 문의할 때 주문 번호를 옮겨 적지 않게 복사 버튼을 둔다. 클립보드를 못 쓰는 환경(http 등)이면 숨긴다. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])
  if (typeof navigator.clipboard?.writeText !== 'function') return null
  return (
    <button
      type="button"
      className={`btn sm ghost ${styles.copy}`}
      title="주문 번호 복사"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => setCopied(true),
          () => setCopied(false),
        )
      }
    >
      {copied ? '복사됨' : '복사'}
    </button>
  )
}
