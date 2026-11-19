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

/**
 * 이전·다음 페이지 이동. 한 페이지뿐이면 그리지 않는다.
 * 끝 쪽에 닿은 버튼은 disabled 대신 aria-disabled로 막는다(disabled면 누른 버튼에 있던 포커스가 사라진다).
 */
export function Pager({ page, totalPages, onChange }: PagerProps) {
  if (totalPages <= 1) return null
  const atFirst = page <= 0
  const atLast = page >= totalPages - 1
  return (
    <nav className="pager" aria-label="페이지">
      <button
        type="button"
        className="btn sm"
        aria-disabled={atFirst || undefined}
        onClick={() => !atFirst && onChange(page - 1)}
      >
        <Chevron back />
        이전
      </button>
      {/* 누른 버튼에 포커스가 남으므로 바뀐 쪽 번호를 알림으로 읽는다. "2 / 5"는 낭독이 모호해 문장으로 읽힌다 */}
      <span className="num pager-pos" aria-live="polite">
        <span aria-hidden="true">
          {page + 1} / {totalPages}
        </span>
        <span className="sr-only">
          전체 {totalPages}쪽 중 {page + 1}쪽
        </span>
      </span>
      <button
        type="button"
        className="btn sm"
        aria-disabled={atLast || undefined}
        onClick={() => !atLast && onChange(page + 1)}
      >
        다음
        <Chevron />
      </button>
    </nav>
  )
}
