import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { walletQuery } from '@/entities/wallet/api'
import {
  DEFAULT_CHARGE_AMOUNT,
  parseChargeAmountParam,
} from '@/entities/wallet/charge'
import { canExchange } from '@/entities/wallet/exchange'
import { canRefund } from '@/entities/wallet/refund'
import type { Wallet } from '@/entities/wallet/types'
import { ChargeModal } from '@/features/wallet-charge/ChargeModal'
import { EarningsPanel } from '@/features/wallet-earnings/EarningsPanel'
import { ExchangeHistory } from '@/features/wallet-exchange/ExchangeHistory'
import { RefundModal } from '@/features/wallet-refund/RefundModal'
import { TransactionLedger } from '@/features/wallet-transactions/TransactionLedger'
import { meQuery } from '@/shared/auth/me'
import { formatNumber } from '@/shared/lib/money'
import { useMergedSearchParams } from '@/shared/lib/useMergedSearchParams'
import { tossClientKey } from '@/shared/lib/tossPayments'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError } from '@/shared/ui/QueryState'
import styles from './WalletPage.module.css'

/**
 * 지갑: 보유 HP(충전·수익)와 보류 HP, HP 충전·충전 HP 환불, HP 거래 원장.
 * 인플루언서는 지급 예정 수익, 환전 신청 진입과 환전 내역도 본다.
 * /wallet?charge=N으로 오면(다른 화면의 "HP 충전하러 가기") 충전 모달을 그 금액으로 연다.
 */
export function WalletPage() {
  const { data: wallet, error, refetch } = useQuery(walletQuery)
  const { data: me } = useQuery(meQuery)
  const clientKey = tossClientKey()
  const [params, merge] = useMergedSearchParams()
  const [chargeAmount, setChargeAmount] = useState<number | null>(() =>
    clientKey ? parseChargeAmountParam(params.get('charge')) : null,
  )
  const hasChargeParam = params.has('charge')
  const [refundOpen, setRefundOpen] = useState(false)
  const navigate = useNavigate()

  // 모달을 연 뒤 주소에서 지워, 새로고침하거나 돌아와도 다시 열리지 않게 한다.
  useEffect(() => {
    if (!hasChargeParam) return
    merge(
      (next) => {
        next.delete('charge')
        return next
      },
      { replace: true },
    )
  }, [hasChargeParam, merge])

  // 내 정보를 받기 전에는 수익 HP를 보여 주지 않는다(유저에게 잠깐 보이지 않게).
  const earns = me ? me.role !== 'USER' : false

  return (
    <div className="page">
      <PageHead
        title="지갑"
        lede="1 HP = 1원. 보유 HP로 강의를 사고 출연료를 내요. 거래 중인 HP는 끝날 때까지 보류돼요."
      />
      {!clientKey && (
        <div className="notice warn">
          결제 설정이 없어요. 지금은 HP를 충전할 수 없어요.
        </div>
      )}
      {error && !wallet ? (
        <LoadError error={error} retry={() => void refetch()} />
      ) : !wallet ? (
        <WalletCardsSkeleton />
      ) : (
        <WalletCards
          wallet={wallet}
          earns={earns}
          canCharge={clientKey !== null}
          onCharge={() => setChargeAmount(DEFAULT_CHARGE_AMOUNT)}
          onRefund={() => setRefundOpen(true)}
          onExchange={() => navigate('/wallet/exchange')}
        />
      )}
      {earns && <EarningsPanel />}
      {earns && <ExchangeHistory />}
      <TransactionLedger />
      {clientKey && chargeAmount !== null && (
        <ChargeModal
          clientKey={clientKey}
          initialAmount={chargeAmount}
          onClose={() => setChargeAmount(null)}
        />
      )}
      {wallet && refundOpen && (
        <RefundModal
          wallet={wallet}
          earns={earns}
          onClose={() => setRefundOpen(false)}
        />
      )}
    </div>
  )
}

type WalletCardsProps = {
  wallet: Wallet
  /** 인플루언서는 수익 HP가 있다(유저는 충전 HP만). */
  earns: boolean
  canCharge: boolean
  onCharge: () => void
  onRefund: () => void
  onExchange: () => void
}

function WalletCards({
  wallet,
  earns,
  canCharge,
  onCharge,
  onRefund,
  onExchange,
}: WalletCardsProps) {
  // 막대는 BE가 준 잔액의 몫만 나눠 보인다(금액을 다시 계산하지 않는다). 둘 다 0이면 빈 막대.
  const charge = wallet.chargeBalanceHp
  const revenue = earns ? wallet.revenueBalanceHp : 0
  const empty = charge <= 0 && revenue <= 0
  return (
    <div className="wallet-grid">
      <section className={`bal ${styles.card}`} aria-label="보유 HP">
        <span className={styles.band} aria-hidden="true">
          {!empty && (
            <>
              <i
                className={styles.charge}
                style={{ flexGrow: Math.max(charge, 0) }}
              />
              <i
                className={styles.earn}
                style={{ flexGrow: Math.max(revenue, 0) }}
              />
            </>
          )}
        </span>
        <div className="lbl">
          <span className={styles.eyebrow}>보유 HP</span>
          <span className="fine">바로 쓸 수 있는 HP</span>
        </div>
        <div className={`amt ${styles.amt}`}>
          {formatNumber(wallet.availableTotalHp)}
          <small>HP</small>
        </div>
        <div className={`hold-lines ${styles.lines}`}>
          <div>
            <span>
              <i className="dot charge" aria-hidden="true" />
              충전 HP
            </span>
            <span className="num c-charge">
              {formatNumber(wallet.chargeBalanceHp)}
            </span>
          </div>
          {earns && (
            <div>
              <span>
                <i className="dot earn" aria-hidden="true" />
                수익 HP
              </span>
              <span className="num c-earn">
                {formatNumber(wallet.revenueBalanceHp)}
              </span>
            </div>
          )}
        </div>
        <p className="desc">
          {earns
            ? '충전한 HP와 출연료·강의 판매로 받은 HP를 합친 금액이에요.'
            : '충전한 HP 중 아직 쓰지 않은 금액이에요.'}
        </p>
        <div className={`acts ${styles.acts}`}>
          <button
            type="button"
            className="btn primary"
            disabled={!canCharge}
            onClick={onCharge}
          >
            충전
          </button>
          <button
            type="button"
            className="btn"
            disabled={!canRefund(wallet.chargeBalanceHp)}
            onClick={onRefund}
          >
            환불
          </button>
          {earns && (
            <button
              type="button"
              className="btn"
              disabled={!canExchange(wallet.revenueBalanceHp)}
              onClick={onExchange}
            >
              환전 신청
            </button>
          )}
        </div>
      </section>
      <section
        className={`bal ${styles.card} ${styles.held}`}
        aria-label="보류 중"
      >
        <span className={styles.band} aria-hidden="true">
          <i className={styles.hold} />
        </span>
        <div className="lbl">
          <span className={styles.eyebrow}>
            <i className="dot hold" aria-hidden="true" />
            보류 중
          </span>
          <span className="pill warn">사용 불가</span>
        </div>
        <div className={`amt c-hold ${styles.amt}`}>
          {formatNumber(wallet.heldTotalHp)}
          <small>HP</small>
        </div>
        <div className={`hold-lines ${styles.lines}`}>
          <div>
            <span className="muted">
              <i className="dot charge" aria-hidden="true" />
              충전 보류
            </span>
            <span className="num">{formatNumber(wallet.heldChargeHp)}</span>
          </div>
          {earns && (
            <div>
              <span className="muted">
                <i className="dot earn" aria-hidden="true" />
                수익 보류
              </span>
              <span className="num">{formatNumber(wallet.heldRevenueHp)}</span>
            </div>
          )}
        </div>
        <p className={styles.why}>
          강의 결제·출연료·환전·환불처럼 아직 끝나지 않은 거래에 묶인 HP예요.
          거래가 끝나면 상대에게 지급되거나 다시 쓸 수 있게 돌아와요.
        </p>
      </section>
    </div>
  )
}

/** 잔액을 받기 전: 카드 모양 그대로 금액 자리만 비워 둔다(화면이 덜컥 바뀌지 않게). */
function WalletCardsSkeleton() {
  return (
    <div className="wallet-grid" role="status">
      <span className="sr-only">불러오는 중…</span>
      {[0, 1].map((i) => (
        <div key={i} className={`bal ${styles.card}`} aria-hidden="true">
          <span className={styles.band} />
          <span className={`${styles.skel} ${styles.skLbl}`} />
          <span className={`${styles.skel} ${styles.skAmt}`} />
          <span className={`${styles.skel} ${styles.skLine}`} />
          <span className={`${styles.skel} ${styles.skShort}`} />
        </div>
      ))}
    </div>
  )
}
