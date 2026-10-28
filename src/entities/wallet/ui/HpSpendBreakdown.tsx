import type { ReactNode } from 'react'
import { formatNumber } from '@/shared/lib/money'
import type { HpSpend } from '../useHpSpend'

type HpSpendBreakdownProps = {
  spend: HpSpend
  /** 첫 줄 이름 (결제할 HP, 보류할 출연료 등) */
  label: string
  /** 아래 안내 문구 */
  note?: ReactNode
}

/** HP 결제·보류 내역: 금액, 수익·충전 HP에서 쓰는 몫, 부족하거나 남는 HP. 지갑을 불러오는 중·실패도 보여 준다. */
export function HpSpendBreakdown({
  spend,
  label,
  note,
}: HpSpendBreakdownProps) {
  const { amount, wallet, error } = spend
  return (
    <div className="breakdown">
      <div className="row">
        <span>{label}</span>
        <b className="num">{formatNumber(amount)} HP</b>
      </div>
      {!wallet &&
        (error ? (
          <div className="notice bad" role="alert">
            보유 HP를 불러오지 못했어요. {error.message}
            <button
              type="button"
              className="btn sm"
              disabled={spend.retrying}
              onClick={spend.retry}
            >
              다시 시도
            </button>
          </div>
        ) : (
          <div className="row sub" role="status">
            <span>보유 HP를 확인하는 중…</span>
          </div>
        ))}
      {wallet && (
        <>
          <div className="row sub">
            <span>
              <span className="c-earn">수익 HP</span>에서
            </span>
            <span className="num">{formatNumber(spend.fromEarn)}</span>
          </div>
          <div className="row sub">
            <span>
              <span className="c-charge">충전 HP</span>에서
            </span>
            <span className="num">{formatNumber(spend.fromCharge)}</span>
          </div>
          {spend.short > 0 ? (
            <div className="row short total">
              <span>부족한 HP</span>
              <span className="num">{formatNumber(spend.short)} HP</span>
            </div>
          ) : (
            <div className="row sub total">
              <span>결제 후 남는 HP</span>
              <span className="num">
                {formatNumber(wallet.availableTotalHp - amount)}
              </span>
            </div>
          )}
        </>
      )}
      {note && <p className="fine">{note}</p>}
    </div>
  )
}
