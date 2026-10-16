import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { walletQuery } from '@/entities/wallet/api'
import {
  DEFAULT_CHARGE_AMOUNT,
  parseChargeAmountParam,
} from '@/entities/wallet/charge'
import { canRefund } from '@/entities/wallet/refund'
import type { Wallet } from '@/entities/wallet/types'
import { ChargeModal } from '@/features/wallet-charge/ChargeModal'
import { RefundModal } from '@/features/wallet-refund/RefundModal'
import { meQuery } from '@/shared/auth/me'
import { formatNumber } from '@/shared/lib/money'
import { tossClientKey } from '@/shared/lib/tossPayments'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'

/**
 * 지갑: 보유 HP(충전·수익)와 보류 HP, HP 충전·충전 HP 환불.
 * /wallet?charge=N으로 오면(다른 화면의 "HP 충전하러 가기") 충전 모달을 그 금액으로 연다.
 * 환전·거래 내역은 BE API가 생기면 붙인다.
 */
export function WalletPage() {
  const { data: wallet, error, refetch } = useQuery(walletQuery)
  const { data: me } = useQuery(meQuery)
  const clientKey = tossClientKey()
  const [params, setParams] = useSearchParams()
  const [chargeAmount, setChargeAmount] = useState<number | null>(() =>
    clientKey ? parseChargeAmountParam(params.get('charge')) : null,
  )
  const hasChargeParam = params.has('charge')
  const [refundOpen, setRefundOpen] = useState(false)

  // 모달을 연 뒤 주소에서 지워, 새로고침하거나 돌아와도 다시 열리지 않게 한다.
  useEffect(() => {
    if (!hasChargeParam) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('charge')
        return next
      },
      { replace: true },
    )
  }, [hasChargeParam, setParams])

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
        <Loading />
      ) : (
        <WalletCards
          wallet={wallet}
          earns={earns}
          canCharge={clientKey !== null}
          onCharge={() => setChargeAmount(DEFAULT_CHARGE_AMOUNT)}
          onRefund={() => setRefundOpen(true)}
        />
      )}
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
}

function WalletCards({
  wallet,
  earns,
  canCharge,
  onCharge,
  onRefund,
}: WalletCardsProps) {
  return (
    <div className="wallet-grid">
      <section className="bal" aria-label="보유 HP">
        <div className="lbl">
          <span>보유 HP</span>
          <span className="fine">바로 쓸 수 있는 HP</span>
        </div>
        <div className="amt">
          {formatNumber(wallet.availableTotalHp)}
          <small>HP</small>
        </div>
        <div className="hold-lines">
          <div>
            <span>
              <i className="dot charge" />
              충전 HP
            </span>
            <span className="num c-charge">
              {formatNumber(wallet.chargeBalanceHp)}
            </span>
          </div>
          {earns && (
            <div>
              <span>
                <i className="dot earn" />
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
        <div className="acts">
          <button
            type="button"
            className="btn primary sm"
            disabled={!canCharge}
            onClick={onCharge}
          >
            충전
          </button>
          <button
            type="button"
            className="btn sm"
            disabled={!canRefund(wallet.chargeBalanceHp)}
            onClick={onRefund}
          >
            환불
          </button>
        </div>
      </section>
      <section className="bal" aria-label="보류 중">
        <div className="lbl">
          <span>
            <i className="dot hold" />
            보류 중
          </span>
          <span className="pill warn">사용 불가</span>
        </div>
        <div className="amt c-hold">
          {formatNumber(wallet.heldTotalHp)}
          <small>HP</small>
        </div>
        <div className="hold-lines">
          <div>
            <span className="muted">충전 보류</span>
            <span className="num">{formatNumber(wallet.heldChargeHp)}</span>
          </div>
          {earns && (
            <div>
              <span className="muted">수익 보류</span>
              <span className="num">{formatNumber(wallet.heldRevenueHp)}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
