import {
  NO_RECRUIT_SEARCH,
  parseRecruitSearch,
  recruitSearchToParams,
  type RecruitSearch,
} from '@/entities/appearance/recruitSearch'
import { useMergedSearchParams } from '@/shared/lib/useMergedSearchParams'

/**
 * 공개 모집 목록의 검색 조건을 URL에 두고 읽는다(뒤로 가기·새로 고침에도 남는다). 조건을 바꾸면 첫 쪽으로 간다.
 * 조건을 연달아 바꿔도 앞서 바꾼 값이 사라지지 않게 useMergedSearchParams로 합친다.
 * 조건은 모집 중 목록에만 있어 주소의 다른 값(tab)은 남기지 않는다
 */
export function useRecruitSearch() {
  const [params, merge] = useMergedSearchParams()
  const search = parseRecruitSearch(params)

  const update = (next: Partial<RecruitSearch>) =>
    merge((current) =>
      recruitSearchToParams({ ...parseRecruitSearch(current), ...next }),
    )
  /** 정렬은 조건이 아니라 보는 순서라 남긴다 */
  const clear = () =>
    merge((current) =>
      recruitSearchToParams({
        ...NO_RECRUIT_SEARCH,
        sort: parseRecruitSearch(current).sort,
      }),
    )

  return { search, update, clear }
}
