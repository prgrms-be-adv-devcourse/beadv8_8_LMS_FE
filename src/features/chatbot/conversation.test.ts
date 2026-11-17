import { describe, expect, it } from 'vitest'
import { appendItem, updateItem, type ChatItem } from './conversation'

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

  it('지운 id(새 대화 뒤 늦게 온 결과)는 무시하고 같은 배열을 돌려준다', () => {
    const items = [notice('a')]
    expect(updateItem(items, 'gone', 'notice', () => notice('x'))).toBe(items)
  })
})
