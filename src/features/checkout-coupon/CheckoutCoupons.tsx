import { useId, useState } from 'react'
import { discountLabel } from '@/entities/coupon/rules'
import { formatNumber } from '@/shared/lib/money'
import type { CheckoutLine, CouponRow, CouponSlot } from './model'
import type { CheckoutCoupons as State } from './useCheckoutCoupons'

/** 플랫폼 쿠폰은 재원이 없는 동안 주문에 쓸 수 없다(BE 409 COUPON_PLATFORM_FUNDING_UNAVAILABLE) */
export const PLATFORM_UNAVAILABLE = '플랫폼 쿠폰은 아직 사용할 수 없어요.'

/**
 * 주문 확인의 쿠폰 할인 영역. 적용 결과(강의별 쿠폰·할인 뒤 금액)와 할인 전 합·할인 합, 직접 선택을 보인다.
 * 결제할 HP(결제액)는 아래 HP 차감 내역이 보인다.
 */
export function CheckoutCoupons({
  coupons,
  lines,
}: {
  coupons: State
  lines: CheckoutLine[]
}) {
  const { view, pending, failed, selections } = coupons
  const [picking, setPicking] = useState(false)
  const manual = selections !== null

  return (
    <section
      className="checkout-coupons"
      aria-label="쿠폰 할인"
      aria-busy={pending}
    >
      <div className="row" style={{ alignItems: 'center' }}>
        <b>쿠폰</b>
        {view?.applied && view.recommended && !pending && (
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
        <p className="fine">
          {manual && coupons.hasUsable
            ? '쿠폰을 쓰지 않아요.'
            : '이 주문에 쓸 수 있는 쿠폰이 없어요.'}
        </p>
      ) : null}
      {coupons.platformRemoved && !pending && (
        <p className="fine" role="status">
          {PLATFORM_UNAVAILABLE} 플랫폼 쿠폰을 빼고 다시 계산했어요.
        </p>
      )}
      {view?.applied && !pending && (
        <>
          <div className="rows">
            {view.rows.map((row) => (
              <CouponLine key={row.lectureId} row={row} manual={manual} />
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
      {coupons.hasUsable && (
        <div className="row-actions">
          <button
            type="button"
            className="btn sm"
            aria-expanded={picking}
            onClick={() => setPicking((open) => !open)}
          >
            {picking ? '직접 고르기 닫기' : '쿠폰 직접 고르기'}
          </button>
          {!(manual && selections.length === 0) && (
            <button
              type="button"
              className="btn sm ghost"
              disabled={pending}
              onClick={coupons.skipCoupons}
            >
              쿠폰 안 쓰기
            </button>
          )}
          {manual && (
            <button
              type="button"
              className="btn sm ghost"
              disabled={pending}
              onClick={coupons.backToRecommend}
            >
              추천으로 돌아가기
            </button>
          )}
        </div>
      )}
      {picking &&
        lines.map((line) => (
          <LecturePicker key={line.lectureId} line={line} coupons={coupons} />
        ))}
    </section>
  )
}

function CouponLine({ row, manual }: { row: CouponRow; manual: boolean }) {
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
            {/* 직접 고른 쿠폰이 이 강의에서 할인되지 않아도 쿠폰은 사용된다(0 할인을 따로 다루지 않는다) */}
            {manual && c.discount === 0 && (
              <> · 이 강의에서는 할인되지 않지만 쿠폰은 사용돼요</>
            )}
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

const SLOTS: { slot: CouponSlot; label: string }[] = [
  { slot: 'SELLER', label: '판매자 쿠폰' },
  { slot: 'PLATFORM', label: '플랫폼 쿠폰' },
]

/** 강의 하나의 쿠폰 칸(판매자 → 플랫폼). 칸마다 '쓰지 않음'을 포함한 라디오 */
function LecturePicker({
  line,
  coupons,
}: {
  line: CheckoutLine
  coupons: State
}) {
  return (
    <fieldset className="coupon-picker">
      <legend>{line.title}</legend>
      {SLOTS.map(({ slot, label }) => (
        <SlotPicker
          key={slot}
          lectureId={line.lectureId}
          slot={slot}
          label={label}
          coupons={coupons}
        />
      ))}
    </fieldset>
  )
}

function SlotPicker({
  lectureId,
  slot,
  label,
  coupons,
}: {
  lectureId: number
  slot: CouponSlot
  label: string
  coupons: State
}) {
  const noteId = useId()
  const name = `coupon-${lectureId}-${slot}`
  const { coupons: list, typing, loading } = coupons.pickable(lectureId, slot)
  const chosen = coupons.current.find(
    (s) =>
      s.lectureId === lectureId &&
      list.some((c) => c.memberCouponId === s.memberCouponId),
  )?.memberCouponId
  // 플랫폼 쿠폰은 재원이 없는 동안 고를 수 없다
  const blocked = slot === 'PLATFORM'
  return (
    <fieldset
      disabled={blocked || coupons.pending}
      aria-describedby={blocked ? noteId : undefined}
    >
      <legend>{label}</legend>
      {blocked && (
        <p id={noteId} className="fine">
          {PLATFORM_UNAVAILABLE}
        </p>
      )}
      <label>
        <input
          type="radio"
          name={name}
          checked={chosen === undefined}
          onChange={() => coupons.choose(lectureId, slot, null)}
        />
        쓰지 않음
      </label>
      {list.map((c) => (
        <label key={c.memberCouponId}>
          <input
            type="radio"
            name={name}
            checked={chosen === c.memberCouponId}
            onChange={() => coupons.choose(lectureId, slot, c.memberCouponId)}
          />
          {c.couponName} · {discountLabel(c)}
          {!c.stackable && <span className="pill mute">단독 사용</span>}
        </label>
      ))}
      {(loading || typing) && (
        <p className="fine" role="status">
          쿠폰을 확인하는 중…
        </p>
      )}
    </fieldset>
  )
}
