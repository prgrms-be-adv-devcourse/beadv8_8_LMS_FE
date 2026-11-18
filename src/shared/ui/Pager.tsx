type PagerProps = {
  /** 0부터 */
  page: number
  totalPages: number
  onChange: (page: number) => void
}

function Chevron({ back }: { back?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={back ? 'M10 3 5 8l5 5' : 'm6 3 5 5-5 5'} />
    </svg>
  )
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
        <Chevron back />
        이전
      </button>
      <span className="num pager-pos">
        {page + 1} / {totalPages}
      </span>
      <button
        type="button"
        className="btn sm"
        disabled={page >= totalPages - 1}
        onClick={() => onChange(page + 1)}
      >
        다음
        <Chevron />
      </button>
    </nav>
  )
}
