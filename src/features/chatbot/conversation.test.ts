import { describe, expect, it } from 'vitest'
import {
  appendItem,
  choose,
  isBusy,
  isLatest,
  replaceItem,
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

describe('추천받기 진행', () => {
  const waiting: ChatItem = {
    id: 'r',
    kind: 'recommendation',
    target: 'LECTURE',
    interest: null,
    result: null,
  }

  it('결과를 기다리는 추천이 있으면 진행 중이다', () => {
    expect(isBusy([notice('a'), waiting])).toBe(true)
    expect(
      isBusy([
        {
          ...waiting,
          result: {
            items: [],
            needsInterest: false,
            basis: 'POPULAR',
            fallback: false,
          },
        } as ChatItem,
      ]),
    ).toBe(false)
    expect(isBusy([])).toBe(false)
  })

  it('실패한 요청 자리를 안내로 바꾼다. 지운 id면 그대로다', () => {
    const items = [notice('a'), waiting, notice('b')]
    const next = replaceItem(items, 'r', [notice('x'), notice('y')])
    expect(next.map((i) => i.id)).toEqual(['a', 'x', 'y', 'b'])
    expect(replaceItem(items, 'gone', [notice('x')])).toBe(items)
  })
})
