type RatingProps = { average: number | null; count: number }

/** ★ 4.8 (120). 리뷰가 없으면 '리뷰 없음' */
export function Rating({ average, count }: RatingProps) {
  if (average === null || count === 0)
    return <span className="fine">리뷰 없음</span>
  return (
    <span
      className="rating"
      aria-label={`평점 ${average.toFixed(1)}점, 리뷰 ${count}개`}
    >
      ★ {average.toFixed(1)} <span className="muted">({count})</span>
    </span>
  )
}

/** ★★★★☆ */
export function Stars({ value }: { value: number }) {
  return (
    <span className="rating" aria-label={`${value}점`}>
      {'★'.repeat(value)}
      <span className="muted">{'★'.repeat(5 - value)}</span>
    </span>
  )
}
