import { queryOptions, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
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

/** 다시 받은 회원별 주소. 값이 undefined면 다시 받는 중이다 */
type Replaced = ReadonlyMap<number, string | null | undefined>
type ReplacedFor = { batchKey: string; urls: Replaced }
const NONE: Replaced = new Map()

/**
 * 회원 ID만 아는 화면(검색 결과 한 페이지)의 프로필 사진. 그 페이지 회원 ID로 한 번에 조회한다.
 * 사진을 불러오지 못하면(onImageError) 그 회원만 한 번 다시 받아 바꿔 끼운다. 다시 받은 주소도 실패하거나 null이면
 * null(글자 아바타)이고 더 시도하지 않는다. 주기적으로 다시 부르지 않는다.
 * 다시 받은 결과는 그 일괄 조회 결과(요청한 ID 목록과 받은 시각)에만 쓴다. 다른 페이지·조건으로 바뀌거나 일괄 조회를
 * 새로 받으면 비워 새 주소를 쓰고 다시 한 번 재시도할 수 있게 한다. 바뀐 뒤 늦게 끝난 다시 받기는 버린다
 */
export function useProfileImages(ids: readonly number[]) {
  const unique = [...new Set(ids)].slice(0, PROFILE_IMAGE_IDS_MAX)
  const { data, dataUpdatedAt } = useQuery(profileImagesQuery(unique))
  const batchKey = `${unique.join(',')}@${dataUpdatedAt}`
  const [replacedFor, setReplacedFor] = useState<ReplacedFor>({
    batchKey,
    urls: NONE,
  })
  const replaced = replacedFor.batchKey === batchKey ? replacedFor.urls : NONE

  const currentKey = useRef(batchKey)
  useEffect(() => {
    currentKey.current = batchKey
  }, [batchKey])

  const batchUrl = (id: number) => data?.[id] ?? null
  const urlOf = (id: number): string | null => {
    const url = replaced.get(id)
    // 다시 받는 동안에는 일괄 조회 주소를 그대로 둔다.
    return url === undefined ? batchUrl(id) : url
  }

  const replace = (key: string, id: number, url: string | null | undefined) => {
    if (currentKey.current !== key) return
    setReplacedFor((prev) => ({
      batchKey: key,
      urls: new Map(prev.batchKey === key ? prev.urls : NONE).set(id, url),
    }))
  }

  const onImageError = (id: number) => {
    if (replaced.has(id)) {
      // 다시 받은 주소도 실패했다. 다시 받는 중이면 그 결과를 기다린다.
      if (replaced.get(id) !== undefined) replace(batchKey, id, null)
      return
    }
    const key = batchKey
    const failed = batchUrl(id)
    replace(key, id, undefined)
    fetchProfileImages([id])
      .then((urls) => urls[id] ?? null)
      .catch(() => null)
      // 같은 주소를 다시 주면(한동안 같은 사진은 같은 주소다) 다시 불러와도 실패하므로 바로 글자 아바타로 둔다.
      .then((url) => replace(key, id, url === failed ? null : url))
  }

  return { urlOf, onImageError }
}
