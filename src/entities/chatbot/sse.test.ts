import { describe, expect, it } from 'vitest'
import { createSseParser, toChatStreamEvent } from './sse'

/** 조각을 차례로 넣고 끝까지 나온 메시지를 모은다 */
function parseAll(chunks: string[]) {
  const parser = createSseParser()
  return [...chunks.flatMap((c) => parser.push(c)), ...parser.end()]
}

describe('createSseParser', () => {
  it('빈 줄마다 이벤트 이름과 data를 내보낸다', () => {
    expect(
      parseAll([
        'event: token\ndata: {"text":"안"}\n\nevent: done\ndata: {}\n\n',
      ]),
    ).toEqual([
      { event: 'token', data: '{"text":"안"}' },
      { event: 'done', data: '{}' },
    ])
  })

  it('줄 중간이나 \\r\\n 사이에서 끊긴 조각을 이어 읽는다', () => {
    expect(
      parseAll(['event: tok', 'en\r', '\ndata: {"te', 'xt":"a"}\r\n', '\r\n']),
    ).toEqual([{ event: 'token', data: '{"text":"a"}' }])
  })

  it('\\r만 쓴 줄바꿈도 받는다', () => {
    expect(parseAll(['event:token\rdata:{"text":"x"}\r\r'])).toEqual([
      { event: 'token', data: '{"text":"x"}' },
    ])
  })

  it('data 줄 여러 개는 \\n으로 잇고, 콜론 뒤 공백은 하나만 뺀다', () => {
    expect(parseAll(['data:  a\ndata: b\n\n'])).toEqual([
      { event: 'message', data: ' a\nb' },
    ])
  })

  it('주석·모르는 필드·data 없는 메시지는 버린다', () => {
    expect(
      parseAll([': keep-alive\n\nid: 3\nretry: 10\nevent: x\n\n']),
    ).toEqual([])
  })

  it('빈 줄 없이 끝난 마지막 메시지도 내보낸다', () => {
    expect(parseAll(['event: done\ndata: {}'])).toEqual([
      { event: 'done', data: '{}' },
    ])
  })
})

describe('toChatStreamEvent', () => {
  it('token·cards·done·error를 이벤트로 바꾼다', () => {
    expect(
      toChatStreamEvent({ event: 'token', data: '{"text":" 앞 공백"}' }),
    ).toEqual({ type: 'token', text: ' 앞 공백' })
    expect(
      toChatStreamEvent({
        event: 'cards',
        data: '{"lectures":{"basis":"POPULAR","items":[]}}',
      }),
    ).toEqual({
      type: 'cards',
      cards: { lectures: { basis: 'POPULAR', items: [] } },
    })
    expect(
      toChatStreamEvent({
        event: 'done',
        data: '{"sources":[{"code":"HP_1","question":"환불은?"}],"fallback":true}',
      }),
    ).toEqual({
      type: 'done',
      sources: [{ code: 'HP_1', question: '환불은?' }],
      fallback: true,
    })
    expect(
      toChatStreamEvent({ event: 'error', data: '{"message":"끊겼어요"}' }),
    ).toEqual({ type: 'error', message: '끊겼어요' })
  })

  it('done에 sources가 없으면 빈 목록이다', () => {
    expect(toChatStreamEvent({ event: 'done', data: '{}' })).toEqual({
      type: 'done',
      sources: [],
      fallback: false,
    })
  })

  it('모르는 이벤트와 읽을 수 없는 data는 무시한다', () => {
    expect(toChatStreamEvent({ event: 'ping', data: '{}' })).toBeNull()
    expect(toChatStreamEvent({ event: 'token', data: 'not json' })).toBeNull()
    expect(toChatStreamEvent({ event: 'token', data: '{"text":1}' })).toBeNull()
  })
})
