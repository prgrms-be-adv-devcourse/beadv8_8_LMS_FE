import { formatNumber } from '@/shared/lib/money'
import type { CouponRow } from './model'
import type { CheckoutCoupons as State } from './useCheckoutCoupons'

/**
 * 주문 확인의 쿠폰 할인 영역. 추천을 적용한 결과(강의별 쿠폰·할인 뒤 금액)와 할인 전 합·할인 합을 보인다.
 * 결제할 HP(결제액)는 아래 HP 차감 내역이 보인다.
 */
export function CheckoutCoupons({ coupons }: { coupons: State }) {
  const { view, pending, failed } = coupons
  return (
    <section
      className="checkout-coupons"
      aria-label="쿠폰 할인"
      aria-busy={pending}
    >
      <div className="row" style={{ alignItems: 'center' }}>
        <b>쿠폰</b>
        {view?.applied && view.recommended && (
          <span className="pill ok">
            {view.optimal ? '최대 할인' : '추천 적용'}
          </span>
        )}
      </div>
      {pending ? (
        <p className="fine" role="status">
          쿠폰 할인을 계산하고 있어요…
        </p>
      ) : failed ? (
        <div className="notice bad" role="alert">
          쿠폰을 확인할 수 없어 정가로 결제돼요.
          <button
            type="button"
            className="btn sm"
            onClick={() => void coupons.quote.refetch()}
          >
            다시 계산
          </button>
        </div>
      ) : view && !view.applied ? (
        <p className="fine">이 주문에 쓸 수 있는 쿠폰이 없어요.</p>
      ) : null}
      {view?.applied && !pending && (
        <>
          <div className="rows">
            {view.rows.map((row) => (
              <CouponLine key={row.lectureId} row={row} />
            ))}
          </div>
          <div className="breakdown" aria-live="polite">
            <div className="row sub">
              <span>할인 전 합</span>
              <span className="num">{formatNumber(view.totalPrice)}</span>
            </div>
            <div className="row sub">
              <span>쿠폰 할인</span>
              <span className="num">−{formatNumber(view.totalDiscount)}</span>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function CouponLine({ row }: { row: CouponRow }) {
  return (
    <div
      className="row-item"
      style={{ padding: '10px 0' }}
      role="group"
      aria-label={row.title}
    >
      <div className="row-main">
        <span className="row-title">{row.title}</span>
        {row.coupons.map((c) => (
          <span key={c.memberCouponId} className="fine">
            {c.name} · −{formatNumber(c.discount)} HP
          </span>
        ))}
      </div>
      <div style={{ textAlign: 'right' }}>
        {row.discount > 0 && (
          <div className="fine num">
            <s>{formatNumber(row.price)} HP</s>
          </div>
        )}
        <span className="num">{formatNumber(row.buyerAmount)} HP</span>
      </div>
    </div>
  )
}
