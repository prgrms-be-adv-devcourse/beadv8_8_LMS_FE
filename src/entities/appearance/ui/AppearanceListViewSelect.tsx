import type { AppearanceListView } from '../api'

/** 성립한 출연 보기 선택: 진행 중(기본) / 끝난 출연 */
export function AppearanceListViewSelect({
  value,
  onChange,
}: {
  value: AppearanceListView
  onChange: (next: AppearanceListView) => void
}) {
  return (
    <select
      className="select sm"
      value={value}
      onChange={(e) => onChange(e.target.value as AppearanceListView)}
      aria-label="성립한 출연 보기"
    >
      <option value="ongoing">진행 중</option>
      <option value="ended">끝난 출연</option>
    </select>
  )
}
