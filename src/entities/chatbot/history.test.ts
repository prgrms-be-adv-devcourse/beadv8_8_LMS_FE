import { describe, expect, it } from 'vitest'
import { buildHistory, HISTORY_LIMITS } from './history'
import type { ChatTurn } from './types'

const user = (content: string): ChatTurn => ({ role: 'USER', content })
const bot = (content: string): ChatTurn => ({ role: 'ASSISTANT', content })

describe('buildHistory', () => {
  it('순서를 그대로 두고 최근 12개만 남긴다', () => {
    const turns = Array.from({ length: 15 }, (_, i) =>
      i % 2 ? bot(`답${i}`) : user(`질문${i}`),
    )
    const history = buildHistory(turns)
    expect(history).toHaveLength(HISTORY_LIMITS.entries)
    expect(history[0].content).toBe('답3')
    expect(history.at(-1)?.content).toBe('질문14')
  })

  it('빈 내용과 공백뿐인 줄은 빼고 센다', () => {
    expect(buildHistory([user('a'), bot('  '), bot(''), user('b')])).toEqual([
      user('a'),
      user('b'),
    ])
  })

  it('USER는 500자, ASSISTANT는 2,000자까지 코드 포인트로 자른다', () => {
    const [u, b] = buildHistory([
      user('가'.repeat(600)),
      bot('😀'.repeat(2100)),
    ])
    expect(u.content).toBe('가'.repeat(500))
    expect(Array.from(b.content)).toHaveLength(2000)
    // 이모지를 반으로 자르지 않는다
    expect(b.content).toBe('😀'.repeat(2000))
  })

  it('글자 수 합이 8,000자를 넘으면 오래된 것부터 뺀다', () => {
    const turns = [
      user('a'),
      bot('x'.repeat(2000)),
      bot('y'.repeat(2000)),
      bot('z'.repeat(2000)),
      bot('w'.repeat(2000)),
    ]
    const history = buildHistory(turns)
    expect(history.map((t) => t.content[0])).toEqual(['x', 'y', 'z', 'w'])
    expect(history.reduce((n, t) => n + t.content.length, 0)).toBe(8000)
  })

  it('잘라서 ASSISTANT로 시작해도 그대로 둔다(BE는 역할 순서를 보지 않는다)', () => {
    const turns = Array.from({ length: 13 }, (_, i) =>
      i % 2 ? bot(`답${i}`) : user(`질문${i}`),
    )
    const history = buildHistory(turns)
    expect(history[0]).toEqual(bot('답1'))
  })

  it('지난 대화가 없으면 빈 목록이다', () => {
    expect(buildHistory([])).toEqual([])
  })
})
