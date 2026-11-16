import { useQuery } from '@tanstack/react-query'
import { categoryName, contentCategoriesQuery } from '../contentCategory'
import type { ContentCategory } from '../types'

type ContentCategoryChipsProps = {
  /** 회원이 고른 순서 그대로 */
  categories: readonly ContentCategory[]
  /** 앞에서 이만큼만 보이고 나머지는 '+n'으로 줄인다. 없으면 모두 */
  max?: number
}

/**
 * 콘텐츠 분야 칩(받은 순서, 첫 번째가 대표). 이름이 없는 분야는 분야 목록에서 찾고, 없으면 숨긴다.
 * 보일 분야가 없으면 그리지 않는다
 */
export function ContentCategoryChips({
  categories,
  max,
}: ContentCategoryChipsProps) {
  // 이름이 빠진 분야가 있을 때만 분야 목록을 받는다.
  if (categories.some((c) => c.name == null))
    return <NamedChips categories={categories} max={max} />
  return <Chips names={categories.map((c) => c.name ?? '')} max={max} />
}

function NamedChips({ categories, max }: ContentCategoryChipsProps) {
  const { data: list } = useQuery(contentCategoriesQuery)
  const names = categories
    .map((c) => categoryName(c, list))
    .filter((name): name is string => name !== null)
  return <Chips names={names} max={max} />
}

function Chips({ names, max }: { names: string[]; max?: number }) {
  if (names.length === 0) return null
  const shown = max === undefined ? names : names.slice(0, max)
  const rest = names.slice(shown.length)
  return (
    <ul className="tags" aria-label="콘텐츠 분야">
      {shown.map((name) => (
        <li key={name} className="tag">
          {name}
        </li>
      ))}
      {rest.length > 0 && (
        <li
          className="tag"
          title={rest.join(', ')}
          aria-label={`그 밖에 ${rest.length}개: ${rest.join(', ')}`}
        >
          +{rest.length}
        </li>
      )}
    </ul>
  )
}
