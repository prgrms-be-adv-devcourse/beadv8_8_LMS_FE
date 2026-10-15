import { EmptyState } from './EmptyState'

/** 화면 데이터를 처음 불러오는 중 */
export function Loading({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div className="panel empty-state" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}

/** 화면 데이터를 불러오지 못함. retry가 있으면 다시 시도 버튼을 둔다. */
export function LoadError({
  error,
  retry,
}: {
  error: Error
  retry?: () => void
}) {
  return (
    <EmptyState
      title="불러오지 못했어요"
      action={
        retry && (
          <button type="button" className="btn" onClick={retry}>
            다시 시도
          </button>
        )
      }
    >
      {error.message}
    </EmptyState>
  )
}

/**
 * 이미 보여 주는 데이터는 그대로 두고, 그 자리에서 다시 불러오기·더 불러오기 실패를 알린다.
 * 첫 조회 실패(보여 줄 데이터가 없음)는 LoadError를 쓴다.
 */
export function InlineLoadError({
  title,
  error,
  retry,
  retrying = false,
}: {
  title: string
  error: Error
  retry: () => void
  retrying?: boolean
}) {
  return (
    <div className="notice bad" role="alert">
      <span>
        {title} {error.message}
      </span>
      <button
        type="button"
        className="btn sm"
        disabled={retrying}
        onClick={retry}
      >
        다시 시도
      </button>
    </div>
  )
}
