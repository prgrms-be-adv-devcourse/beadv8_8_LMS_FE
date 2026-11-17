import { describe, expect, it } from 'vitest'
import { parseSaved } from './persistence'

const stored = (value: unknown) => JSON.stringify(value)

describe('저장한 대화 읽기', () => {
  it('같은 형식이면 회원 ID와 말풍선을 돌려준다', () => {
    const items = [{ id: 'a', kind: 'notice', text: '안내' }]
    expect(parseSaved(stored({ version: 1, memberId: 3, items }))).toEqual({
      memberId: 3,
      items,
    })
  })

  it('없거나 읽을 수 없거나 형식이 다르면 null이다', () => {
    expect(parseSaved(null)).toBeNull()
    expect(parseSaved('{')).toBeNull()
    expect(
      parseSaved(stored({ version: 0, memberId: 3, items: [] })),
    ).toBeNull()
    expect(parseSaved(stored({ version: 1, items: [] }))).toBeNull()
    expect(parseSaved(stored({ version: 1, memberId: 3 }))).toBeNull()
  })

  it('되살릴 수 없는 말풍선(모르는 종류)은 버린다', () => {
    const saved = parseSaved(
      stored({
        version: 1,
        memberId: 3,
        items: [
          { id: 'a', kind: 'notice', text: '안내' },
          { id: 'b', kind: 'unknown' },
        ],
      }),
    )
    expect(saved?.items.map((i) => i.id)).toEqual(['a'])
  })
})
