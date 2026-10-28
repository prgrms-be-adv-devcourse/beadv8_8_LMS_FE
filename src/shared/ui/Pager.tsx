type PagerProps = {
  /** 0부터 */
  page: number
  totalPages: number
  onChange: (page: number) => void
}

/** 이전·다음 페이지 이동. 한 페이지뿐이면 그리지 않는다. */
export function Pager({ page, totalPages, onChange }: PagerProps) {
  if (totalPages <= 1) return null
  return (
    <nav className="pager" aria-label="페이지">
      <button
        type="button"
        className="btn sm"
        disabled={page <= 0}
        onClick={() => onChange(page - 1)}
      >
        이전
      </button>
      <span className="num">
        {page + 1} / {totalPages}
      </span>
      <button
        type="button"
        className="btn sm"
        disabled={page >= totalPages - 1}
        onClick={() => onChange(page + 1)}
      >
        다음
      </button>
    </nav>
  )
}
