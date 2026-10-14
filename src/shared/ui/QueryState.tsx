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
