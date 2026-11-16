import { describe, expect, it } from 'vitest'
import {
  listSortOf,
  normalizeKeyword,
  parseBrowseSort,
  searchSortOf,
} from './search'
import type { LectureBrowseSort } from './types'

describe('강의 정렬 바꾸기', () => {
  it.each<[LectureBrowseSort, string, string | undefined]>([
    ['DEFAULT', 'LATEST', undefined],
    ['LATEST', 'LATEST', 'latest,desc'],
    ['PRICE_ASC', 'PRICE_ASC', 'price,asc'],
    ['PRICE_DESC', 'PRICE_DESC', 'price,desc'],
    ['RATING', 'RATING', 'rating,desc'],
  ])('%s → 목록 %s, 검색 %s', (sort, list, search) => {
    expect(listSortOf(sort)).toBe(list)
    expect(searchSortOf(sort)).toBe(search)
  })

  it('URL의 모르는 정렬은 기본이다', () => {
    expect(parseBrowseSort('price,asc')).toBe('DEFAULT')
    expect(parseBrowseSort('DEFAULT')).toBe('DEFAULT')
    expect(parseBrowseSort(null)).toBe('DEFAULT')
    expect(parseBrowseSort('RATING')).toBe('RATING')
  })
})

describe('normalizeKeyword', () => {
  it('앞뒤·연속 공백을 정리하고 50자로 자른다', () => {
    expect(normalizeKeyword('  배그   입문 ')).toBe('배그 입문')
    expect(normalizeKeyword('   ')).toBe('')
    expect(normalizeKeyword('가'.repeat(60))).toHaveLength(50)
  })
})
