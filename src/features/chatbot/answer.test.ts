import { describe, expect, it } from 'vitest'
import {
  applyStreamEvent,
  CUT_OFF_MESSAGE,
  endStream,
  failAnswer,
  historyFor,
  RELOADED_MESSAGE,
  restoreAnswer,
  streamingAnswer,
} from './answer'
import type { AnswerItem, ChatItem } from './conversation'

const question = (id: string, text: string): ChatItem => ({
  id,
  kind: 'question',
  mode: 'FREE',
  text,
})
const answer = (id: string, patch: Partial<AnswerItem> = {}): AnswerItem => ({
  ...streamingAnswer(id, 'FREE'),
  ...patch,
})
const find = (items: readonly ChatItem[], id: string) =>
  items.find((i) => i.id === id) as AnswerItem

describe('답 스트림 반영', () => {
  it('조각을 이어 붙이고 카드·근거를 두고 done이면 끝낸다', () => {
    let items: readonly ChatItem[] = [answer('a')]
    items = applyStreamEvent(items, 'a', { type: 'token', text: '환불은 ' })
    items = applyStreamEvent(items, 'a', { type: 'token', text: '지갑에서' })
    items = applyStreamEvent(items, 'a', {
      type: 'cards',
      cards: { lectures: { basis: 'POPULAR', items: [] } },
    })
    items = applyStreamEvent(items, 'a', {
      type: 'done',
      sources: [{ code: 'HP', question: '환불?' }],
      fallback: false,
    })
    expect(find(items, 'a')).toMatchObject({
      status: 'done',
      text: '환불은 지갑에서',
      cards: { lectures: { basis: 'POPULAR', items: [] } },
      sources: [{ code: 'HP', question: '환불?' }],
    })
  })

  it('error면 받은 글은 남기고 안내를 붙인다. 문구가 없으면 정해진 안내다', () => {
    let items: readonly ChatItem[] = [answer('a', { text: '앞부분' })]
    items = applyStreamEvent(items, 'a', { type: 'error', message: '' })
    expect(find(items, 'a')).toMatchObject({
      status: 'error',
      text: '앞부분',
      errorMessage: CUT_OFF_MESSAGE,
    })
  })

  it('끝난 답에 늦게 온 이벤트는 무시한다', () => {
    const items = [answer('a', { status: 'done', text: '끝' })]
    expect(applyStreamEvent(items, 'a', { type: 'token', text: '더' })).toEqual(
      items,
    )
  })

  it('done·error 없이 스트림이 끝나면 끊긴 것으로 본다', () => {
    expect(find(endStream([answer('a')], 'a'), 'a')).toMatchObject({
      status: 'error',
      errorMessage: CUT_OFF_MESSAGE,
    })
    const done = [answer('a', { status: 'done' })]
    expect(endStream(done, 'a')).toEqual(done)
  })
})

describe('질문 실패', () => {
  const ids = { notice: 'n', guide: 'g' }

  it('받은 글이 없으면 답 자리를 안내와 메뉴로 바꾼다', () => {
    const next = failAnswer(
      [question('q', '질문'), answer('a')],
      'a',
      '많아요',
      ids,
    )
    expect(next.map((i) => [i.id, i.kind])).toEqual([
      ['q', 'question'],
      ['n', 'notice'],
      ['g', 'guide'],
    ])
  })

  it('이미 끝난 답은 바꾸지 않는다', () => {
    const items = [answer('a', { status: 'done', text: '끝' })]
    expect(failAnswer(items, 'a', '실패', ids)).toBe(items)
  })

  it('받은 글이 있으면 글을 남기고 안내를 붙인다', () => {
    const next = failAnswer([answer('a', { text: '앞' })], 'a', '끊겼어요', ids)
    expect(find(next, 'a')).toMatchObject({
      status: 'error',
      text: '앞',
      errorMessage: '끊겼어요',
    })
  })
})

describe('자유 질문 history', () => {
  it('내 질문과 답의 글만 오래된 것부터 넣는다', () => {
    const items: ChatItem[] = [
      { id: 'c', kind: 'choice', text: 'FAQ 질문하기' },
      { id: 'g', kind: 'guide', text: '적어 주세요', options: [] },
      { ...question('q1', '환불은?'), mode: 'FAQ' } as ChatItem,
      answer('a1', { mode: 'FAQ', status: 'done', text: '지갑에서요' }),
      { id: 'n', kind: 'notice', text: '요청이 많아요' },
      {
        id: 'r',
        kind: 'recommendation',
        target: 'LECTURE',
        interest: null,
        result: {
          items: [],
          needsInterest: false,
          basis: 'POPULAR',
          fallback: false,
        },
      },
      question('q2', '강의 추천해 줘'),
      answer('a2', {
        status: 'done',
        text: '이 강의들이에요',
        cards: { lectures: { basis: 'PERSONALIZED', items: [] } },
      }),
    ]
    expect(historyFor(items)).toEqual([
      { role: 'USER', content: '환불은?' },
      { role: 'ASSISTANT', content: '지갑에서요' },
      { role: 'USER', content: '강의 추천해 줘' },
      { role: 'ASSISTANT', content: '이 강의들이에요' },
    ])
  })

  it('답의 글을 받지 못한 질문은 뺀다. 끊긴 답도 받은 글은 넣는다', () => {
    const items: ChatItem[] = [
      question('q1', '실패한 질문'),
      { id: 'n', kind: 'notice', text: '요청이 많아요' },
      question('q2', '끊긴 질문'),
      answer('a2', { status: 'error', text: '앞부분', errorMessage: '끊김' }),
    ]
    expect(historyFor(items)).toEqual([
      { role: 'USER', content: '끊긴 질문' },
      { role: 'ASSISTANT', content: '앞부분' },
    ])
  })

  it('최근 12개만 넣는다', () => {
    const items: ChatItem[] = Array.from({ length: 10 }, (_, i) => [
      question(`q${i}`, `질문${i}`),
      answer(`a${i}`, { status: 'done', text: `답${i}` }),
    ]).flat()
    const history = historyFor(items)
    expect(history).toHaveLength(12)
    expect(history[0].content).toBe('질문4')
  })
})

describe('새로고침으로 되살리기', () => {
  it('받던 답은 저장된 글을 그대로 두고 끊겼다고 표시한다', () => {
    expect(restoreAnswer(answer('a', { text: '앞' }))).toMatchObject({
      status: 'error',
      text: '앞',
      errorMessage: RELOADED_MESSAGE,
    })
    const done = answer('a', { status: 'done' })
    expect(restoreAnswer(done)).toBe(done)
  })
})
