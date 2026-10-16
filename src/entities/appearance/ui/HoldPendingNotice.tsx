type Props = {
  /** 아직 기다리는 시간 안인지 */
  polling: boolean
  refreshing: boolean
  onRefresh: () => void
  onDismiss: () => void
}

/** 보류 확인이 늦어진 글을 목록에서 기다리는 동안의 안내. 시간이 지나도 실패로 단정하지 않는다 */
export function HoldPendingNotice({
  polling,
  refreshing,
  onRefresh,
  onDismiss,
}: Props) {
  return (
    <div className="notice warn" role="status">
      <span>
        {polling
          ? '포인트를 확인하고 있어요. 보통 1~2분 걸려요.'
          : '아직 확인 중이에요. 잠시 뒤 새로고침해 보세요. 잔액이 부족했다면 등록되지 않아요.'}
      </span>
      <button
        type="button"
        className="btn sm"
        disabled={refreshing}
        onClick={onRefresh}
      >
        새로고침
      </button>
      <button type="button" className="btn ghost sm" onClick={onDismiss}>
        닫기
      </button>
    </div>
  )
}
