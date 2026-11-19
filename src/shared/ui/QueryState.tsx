import { EmptyState } from './EmptyState'

/** 계기판 레벨 미터. 불러오는 중임을 보이는 장식이다 */
function Meter() {
  return (
    <span className="meter" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

/**
 * 화면 데이터를 처음 불러오는 중.
 * rows를 주면 그만큼 글줄 뼈대를 함께 그려 목록이 들어올 자리를 미리 잡는다(문구는 그대로 읽힌다).
 */
export function Loading({
  label = '불러오는 중…',
  rows,
}: {
  label?: string
  rows?: number
}) {
  if (rows && rows > 0)
    return (
      <div className="panel empty-state loading with-rows" role="status">
        <div className="loading-head">
          <Meter />
          <p>{label}</p>
        </div>
        <div className="skeleton-stack" aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => (
            <span key={i} className="skeleton text" />
          ))}
        </div>
      </div>
    )
  return (
    <div className="panel empty-state loading" role="status">
      <Meter />
      <p>{label}</p>
    </div>
  )
}

/**
 * 화면 데이터를 불러오지 못함. retry가 있으면 다시 시도 버튼을 둔다.
 * 불러오는 중 문구가 이 안내로 바뀌어도 낭독기가 알도록 알림(role="alert")으로 그린다.
 */
export function LoadError({
  error,
  retry,
}: {
  error: Error
  retry?: () => void
}) {
  return (
    <EmptyState
      role="alert"
      title="불러오지 못했어요"
      art="error"
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
      <span className="notice-text">
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
