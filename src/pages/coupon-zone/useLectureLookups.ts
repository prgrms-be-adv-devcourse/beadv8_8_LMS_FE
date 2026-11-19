import { useQueries, useQueryClient } from '@tanstack/react-query'
import { lectureKeys, lectureQuery } from '@/entities/lecture/api'
import { lectureLookupOf, type LectureLookup } from './zone'

/**
 * 동시에 부르는 강의 상세 수. 받을 수 있는 쿠폰은 최대 100건이라 강의가 다 다르면 강의 상세(콘텐츠까지 담긴 전체 상세)를
 * 한꺼번에 100번 부르게 된다. 제목만 주는 일괄 API가 없어 몇 개씩 차례로 부른다
 */
export const LECTURE_LOOKUP_CONCURRENCY = 6

/**
 * 강의별 쿠폰의 강의를 화면 순서대로 LECTURE_LOOKUP_CONCURRENCY개씩 확인한다. 하나가 끝나면(성공·실패) 다음 강의를 부른다.
 * 아직 차례가 아닌 강의는 요청하지 않아, 화면을 떠나면 남은 강의는 부르지 않는다.
 */
export function useLectureLookups(lectureIds: number[]): LectureLookup[] {
  const queryClient = useQueryClient()
  // 끝난 조회는 캐시에서 본다. 끝나지 않은 강의는 앞에서부터 남은 자리만큼만 켜므로, 이미 부르는 강의는 계속 켜져 있다.
  let free = LECTURE_LOOKUP_CONCURRENCY
  const results = useQueries({
    queries: lectureIds.map((lectureId) => {
      const status = queryClient.getQueryState(
        lectureKeys.detail(lectureId),
      )?.status
      const settled = status === 'success' || status === 'error'
      return { ...lectureQuery(lectureId), enabled: settled || free-- > 0 }
    }),
  })
  return results.map(lectureLookupOf)
}
