import { formatNumber } from '@/shared/lib/money'

/** HP 종류는 색으로 고정한다: 충전=파랑, 수익=초록, 보류=호박색 */
export type HpKind = 'charge' | 'earn' | 'hold'

type HpAmountProps = { value: number; kind?: HpKind }

export function HpAmount({ value, kind }: HpAmountProps) {
  return (
    <span className={kind ? `num c-${kind}` : 'num'}>
      {formatNumber(value)} HP
    </span>
  )
}
