import { api } from './client'
import type { PagedModel } from './types'

/** 보유 여부·내 리뷰처럼 누락 없이 판단해야 하는 목록을 끝까지 조회한다. */
export async function allPages<T>(path: string): Promise<PagedModel<T>> {
  const first = await api<PagedModel<T>>(path, {
    query: { page: 0, size: 100 },
  })
  const content = [...first.content]
  for (let page = 1; page < first.page.totalPages; page++) {
    const next = await api<PagedModel<T>>(path, { query: { page, size: 100 } })
    content.push(...next.content)
  }
  return {
    content,
    page: {
      number: 0,
      size: content.length,
      totalElements: content.length,
      totalPages: content.length ? 1 : 0,
    },
  }
}
