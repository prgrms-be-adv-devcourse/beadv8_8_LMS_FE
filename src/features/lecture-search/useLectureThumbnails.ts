import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  fetchLectureThumbnails,
  lectureThumbnailsQuery,
} from '@/entities/lecture/api'

/**
 * 검색 결과 한 페이지의 썸네일을 강의 ID로 한 번에 받는다.
 * 이미지를 불러오지 못하면(주소 만료 등) 그 강의만 한 번 다시 받아 바꾸고, 다시 받은 주소도 실패하거나 null이면 기본 이미지다.
 * 주기적으로 다시 부르지 않는다.
 *
 * urlOf: 주소, null이면 기본 이미지, undefined면 아직 받는 중
 */
export function useLectureThumbnails(lectureIds: readonly number[]) {
  const { data, isError } = useQuery(lectureThumbnailsQuery(lectureIds))
  // 한 번 다시 받은 강의. 값이 undefined면 다시 받는 중이다
  const [retried, setRetried] = useState<
    ReadonlyMap<number, string | null | undefined>
  >(new Map())

  const setRetry = (lectureId: number, url: string | null | undefined) =>
    setRetried((prev) => new Map(prev).set(lectureId, url))

  const urlOf = (lectureId: number): string | null | undefined => {
    if (retried.has(lectureId)) return retried.get(lectureId)
    if (isError) return null
    return data ? (data[String(lectureId)] ?? null) : undefined
  }

  const onError = (lectureId: number) => {
    if (retried.has(lectureId)) {
      setRetry(lectureId, null)
      return
    }
    setRetry(lectureId, undefined)
    fetchLectureThumbnails([lectureId])
      .then(
        (urls) => urls[String(lectureId)] ?? null,
        () => null,
      )
      .then((url) => setRetry(lectureId, url))
  }

  return { urlOf, onError }
}
