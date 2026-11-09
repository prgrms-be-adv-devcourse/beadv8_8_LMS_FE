import { useQueries, useQuery } from '@tanstack/react-query'
import { myLecturesQuery } from '@/entities/lecture/api'
import type { MyLecture } from '@/entities/lecture/types'

/** 쿠폰을 신청할 수 있는 강의: 판매 중이고 삭제하지 않은 내 강의(강의 판매 화면의 '판매 중'과 같은 기준) */
export const isOnSale = (lecture: Pick<MyLecture, 'status' | 'deleted'>) =>
  lecture.status === 'ON_SALE' && !lecture.deleted

/**
 * 내 강의 전부(삭제한 강의 제외). 강의 선택과 쿠폰 목록의 강의 제목에 쓴다.
 * 첫 페이지만으로는 판매 중 강의를 다 알 수 없으므로 첫 페이지의 전체 페이지 수만큼 나머지 페이지도 읽는다.
 */
export function useMyLectureOptions() {
  const first = useQuery(myLecturesQuery(0))
  const totalPages = first.data?.page.totalPages ?? 0
  const rest = useQueries({
    queries: Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) =>
      myLecturesQuery(i + 1),
    ),
  })
  const pages = [first, ...rest]
  const error = pages.find((q) => q.error)?.error ?? null
  const isPending = pages.some((q) => q.isPending)
  const lectures = pages
    .flatMap((q) => q.data?.content ?? [])
    .filter((lecture) => !lecture.deleted)
  const titleOf = (lectureId: number | null) =>
    lectureId === null
      ? undefined
      : lectures.find((l) => l.lectureId === lectureId)?.title
  return {
    lectures,
    isPending,
    error,
    titleOf,
    refetch: () => pages.forEach((q) => q.error && q.refetch()),
  }
}

export type MyLectureOptions = ReturnType<typeof useMyLectureOptions>
