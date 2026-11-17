import { describe, expect, it } from 'vitest'
import {
  appendItem,
  choose,
  isLatest,
  updateItem,
  type ChatItem,
} from './conversation'

const notice = (id: string, text = '안내'): ChatItem => ({
  id,
  kind: 'notice',
  text,
})

describe('대화 상태 전이', () => {
  it('말풍선을 끝에 더하고 원래 배열은 바꾸지 않는다', () => {
    const before = [notice('a')]
    const after = appendItem(before, notice('b'))
    expect(after.map((i) => i.id)).toEqual(['a', 'b'])
    expect(before).toHaveLength(1)
  })

  it('id로 찾아 바꾼다', () => {
    const items = [notice('a'), notice('b')]
    const next = updateItem(items, 'b', 'notice', (item) => ({
      ...item,
      text: '바뀜',
    }))
    expect(next[1]).toEqual(notice('b', '바뀜'))
    expect(next[0]).toBe(items[0])
  })

  it('지운 id(새 대화 뒤 늦게 온 결과)나 종류가 다른 말풍선은 바꾸지 않는다', () => {
    const items = [notice('a')]
    expect(updateItem(items, 'gone', 'notice', () => notice('x'))).toBe(items)
    expect(updateItem(items, 'a', 'choice', (c) => ({ ...c, text: 'x' }))).toBe(
      items,
    )
  })
})

describe('말풍선 안 버튼', () => {
  it('가장 마지막 말풍선의 버튼만 누를 수 있다. 인사는 대화가 비어 있을 때만', () => {
    const items = [notice('a'), notice('b')]
    expect(isLatest(items, 'b')).toBe(true)
    expect(isLatest(items, 'a')).toBe(false)
    expect(isLatest(items, null)).toBe(false)
    expect(isLatest([], null)).toBe(true)
  })

  it('고르면 고른 것을 내 말풍선으로 남기고 안내를 붙인다', () => {
    const next = choose(
      [],
      'FAQ_QUESTION',
      { choice: 'c', guide: 'g' },
      { text: '적어 주세요', options: [] },
    )
    expect(next).toEqual([
      { id: 'c', kind: 'choice', text: 'FAQ 질문하기' },
      { id: 'g', kind: 'guide', text: '적어 주세요', options: [] },
    ])
  })

  it('안내가 없으면 고른 것만 남긴다', () => {
    expect(choose([], 'LECTURE', { choice: 'c', guide: 'g' })).toEqual([
      { id: 'c', kind: 'choice', text: '강의 추천' },
    ])
  })
})
