import { useId, useState } from 'react'
import { discountLabel } from '@/entities/coupon/rules'
import { formatNumber } from '@/shared/lib/money'
import { InlineLoadError, Loading } from '@/shared/ui/QueryState'
import {
  PLATFORM_UNAVAILABLE,
  type CheckoutLine,
  type CouponRow,
  type CouponSlot,
} from './model'
import type { CheckoutCoupons as State } from './useCheckoutCoupons'
import styles from './CheckoutCoupons.module.css'

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
  const { view, pending, failed, selections, orderError, quoteError } = coupons
  const [picking, setPicking] = useState(false)
  const manual = selections !== null
  const rejectedName = orderError?.couponName

  return (
    <section className={styles.area} aria-label="쿠폰 할인" aria-busy={pending}>
      <div className={styles.head}>
        <b>쿠폰</b>
        {view?.applied && view.recommended && !pending && (
          <span className="pill ok">
            {view.optimal ? '최대 할인' : '추천 적용'}
          </span>
        )}
      </div>
      {orderError && (
        <div className="notice bad" role="alert">
          {rejectedName && <b>{rejectedName}: </b>}
          {orderError.message}
        </div>
      )}
      {pending ? (
        <p className="fine" role="status">
          쿠폰 할인을 계산하고 있어요…
        </p>
      ) : failed ? (
        <div className="notice bad" role="alert">
          {quoteError?.memberCouponId && (
            <b>{coupons.couponName(quoteError.memberCouponId) ?? '쿠폰'}: </b>
          )}
          {quoteError?.message} 쿠폰을 확인할 수 없어 정가로 결제돼요.
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
        <div className="rows">
          {view.rows.map((row) => (
            <CouponLine
              key={row.lectureId}
              row={row}
              manual={manual}
              rejected={orderError}
            />
          ))}
        </div>
      )}
      {/* 합계는 바뀔 때 읽히도록 영역(스타일 없음)을 늘 두고 내용만 바꾼다 */}
      <div aria-live="polite">
        {view?.applied && !pending && (
          <div className="breakdown">
            <div className="row sub">
              <span>할인 전 합</span>
              <span className="num">{formatNumber(view.totalPrice)}</span>
            </div>
            <div className="row sub">
              <span>쿠폰 할인</span>
              <span className="num">−{formatNumber(view.totalDiscount)}</span>
            </div>
          </div>
        )}
      </div>
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

function CouponLine({
  row,
  manual,
  rejected,
}: {
  row: CouponRow
  manual: boolean
  rejected: State['orderError']
}) {
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
            {rejected?.memberCouponId === c.memberCouponId && (
              <span className="c-bad" role="alert">
                {' '}
                · {rejected.message}
              </span>
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
    <fieldset className={styles.lecture}>
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
  const {
    coupons: list,
    typing,
    loading,
    error,
    retry,
    retrying,
    untypedFailed,
  } = coupons.pickable(lectureId, slot)
  // 목록 상태(불러오는 중·실패·종류 확인 실패)는 판매자 칸에서 한 번만 보인다
  const showStatus = slot === 'SELLER'
  const chosen = coupons.current.find(
    (s) =>
      s.lectureId === lectureId &&
      list.some((c) => c.memberCouponId === s.memberCouponId),
  )?.memberCouponId
  // 플랫폼 쿠폰은 재원이 없는 동안 고를 수 없다
  const blocked = slot === 'PLATFORM'
  return (
    <fieldset
      className={styles.slot}
      disabled={blocked || coupons.pending}
      aria-describedby={blocked ? noteId : undefined}
    >
      <legend>{label}</legend>
      {blocked && (
        <p id={noteId} className="fine">
          {PLATFORM_UNAVAILABLE}
        </p>
      )}
      <label className={styles.option}>
        <input
          type="radio"
          name={name}
          checked={chosen === undefined}
          onChange={() => coupons.choose(lectureId, slot, null)}
        />
        쓰지 않음
      </label>
      {list.map((c) => (
        <label key={c.memberCouponId} className={styles.option}>
          <input
            type="radio"
            name={name}
            checked={chosen === c.memberCouponId}
            onChange={() => coupons.choose(lectureId, slot, c.memberCouponId)}
          />
          {c.couponName} · {discountLabel(c)}
          {!c.stackable && <span className="pill mute">단독 사용</span>}
          {coupons.orderError?.memberCouponId === c.memberCouponId && (
            <span className="fine c-bad" role="alert">
              {coupons.orderError.message}
            </span>
          )}
          {coupons.quoteError?.memberCouponId === c.memberCouponId && (
            <span className="fine c-bad" role="alert">
              {coupons.quoteError.message}
            </span>
          )}
        </label>
      ))}
      {showStatus && (loading || typing) && (
        <Loading label="쓸 수 있는 쿠폰을 확인하는 중…" />
      )}
      {showStatus && error && (
        <InlineLoadError
          title="쓸 수 있는 쿠폰을 불러오지 못했어요."
          error={error}
          retry={retry}
          retrying={retrying}
        />
      )}
      {showStatus && untypedFailed.length > 0 && (
        <p className="fine">
          쿠폰 종류를 확인하지 못해 고를 수 없어요:{' '}
          {untypedFailed.map((c) => c.couponName).join(', ')}
        </p>
      )}
    </fieldset>
  )
}
