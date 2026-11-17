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

  it('모르는 종류는 버리고, 결과를 기다리던 추천은 안내와 메뉴로 바꾼다(메뉴 없이 멈추지 않게)', () => {
    const saved = parseSaved(
      stored({
        version: 1,
        memberId: 3,
        items: [
          { id: 'a', kind: 'notice', text: '안내' },
          { id: 'b', kind: 'unknown' },
          {
            id: 'c',
            kind: 'recommendation',
            target: 'LECTURE',
            interest: null,
            result: null,
          },
        ],
      }),
    )
    expect(saved?.items.map((i) => [i.id, i.kind])).toEqual([
      ['a', 'notice'],
      ['c-reloaded', 'notice'],
      ['c-reloaded-menu', 'guide'],
    ])
  })
})
