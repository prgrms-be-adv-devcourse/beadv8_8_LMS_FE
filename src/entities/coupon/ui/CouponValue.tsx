import { formatNumber } from '@/shared/lib/money'
import type { DiscountType } from '../types'
import styles from './CouponValue.module.css'

/**
 * 티켓 왼쪽의 큰 할인 값(10% / 3,000 HP). 같은 내용을 글로 쓴 할인 문구가 옆에 있어 장식으로 둔다.
 * 모르는 할인 종류는 숫자로 단정하지 않고 '쿠폰'으로 보인다
 */
export function CouponValue({
  discountType,
  discountValue,
}: {
  discountType: DiscountType
  discountValue: number
}) {
  return (
    <span className={styles.value} aria-hidden="true">
      {discountType === 'RATE' ? (
        <>
          <b className="num">{discountValue}</b>
          <span className={styles.unit}>%</span>
        </>
      ) : discountType === 'AMOUNT' ? (
        <>
          <b className={`num ${styles.amount}`}>
            {formatNumber(discountValue)}
          </b>
          <span className={styles.unit}>HP</span>
        </>
      ) : (
        <b className={styles.word}>쿠폰</b>
      )}
    </span>
  )
}
