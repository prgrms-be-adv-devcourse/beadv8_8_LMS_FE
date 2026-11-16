import { queryOptions, useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { api } from '@/shared/api/client'
import { memberKeys } from './api'

/** 한 번에 물을 수 있는 회원 ID 수 (BE ApiV1MemberProfileImageSpec.MAX_IDS) */
export const PROFILE_IMAGE_IDS_MAX = 100

/** 사진 주소를 받은 뒤 대개 쓸 수 있는 시간. 이보다 오래된 결과는 화면을 다시 열 때 새로 받는다 */
const PROFILE_IMAGE_URL_FRESH = 10 * 60_000

type ProfileImageUrls = Record<string, string | null>

/**
 * 회원 ID별 프로필 사진 주소. 요청한 ID마다 키가 있고(JSON이라 키는 문자열), 사진이 없거나 없는·볼 수 없는 회원이면 null
 */
function fetchProfileImages(ids: readonly number[], signal?: AbortSignal) {
  return api<ProfileImageUrls>('/members/profile-images', {
    query: { ids: ids.join(',') },
    signal,
  })
}

export const profileImagesQuery = (ids: readonly number[]) =>
  queryOptions({
    queryKey: memberKeys.profileImages(ids.join(',')),
    queryFn: ({ signal }) => fetchProfileImages(ids, signal),
    enabled: ids.length > 0,
    staleTime: PROFILE_IMAGE_URL_FRESH,
  })

/**
 * 회원 ID만 아는 화면(검색 결과 한 페이지)의 프로필 사진. 그 페이지 회원 ID로 한 번에 조회한다.
 * 사진을 불러오지 못하면(onImageError) 그 회원만 한 번 다시 받아 바꿔 끼운다. 다시 받은 주소도 실패하거나 null이면
 * null(글자 아바타)이고 더 시도하지 않는다. 주기적으로 다시 부르지 않는다
 */
export function useProfileImages(ids: readonly number[]) {
  const unique = [...new Set(ids)].slice(0, PROFILE_IMAGE_IDS_MAX)
  const { data } = useQuery(profileImagesQuery(unique))
  const [replaced, setReplaced] = useState<ReadonlyMap<number, string | null>>(
    () => new Map(),
  )
  const retried = useRef(new Set<number>())

  const urlOf = (id: number): string | null =>
    replaced.has(id) ? (replaced.get(id) ?? null) : (data?.[id] ?? null)

  const replace = (id: number, url: string | null) =>
    setReplaced((prev) => new Map(prev).set(id, url))

  const onImageError = (id: number) => {
    if (retried.current.has(id)) {
      replace(id, null)
      return
    }
    retried.current.add(id)
    const failed = urlOf(id)
    fetchProfileImages([id])
      .then((urls) => urls[id] ?? null)
      .catch(() => null)
      // 같은 주소를 다시 주면(한동안 같은 사진은 같은 주소다) 다시 불러와도 실패하므로 바로 글자 아바타로 둔다.
      .then((url) => replace(id, url === failed ? null : url))
  }

  return { urlOf, onImageError }
}
