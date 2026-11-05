import type { HoldListView } from '../api'

/** 보기 선택: 등록된 글(기본, 보류 실패 제외) / 등록 실패 */
export function HoldListViewSelect({
  value,
  onChange,
}: {
  value: HoldListView
  onChange: (next: HoldListView) => void
}) {
  return (
    <select
      className="select sm"
      value={value}
      onChange={(e) => onChange(e.target.value as HoldListView)}
      aria-label="보기"
    >
      <option value="active">등록된 글</option>
      <option value="failed">등록 실패</option>
    </select>
  )
}
