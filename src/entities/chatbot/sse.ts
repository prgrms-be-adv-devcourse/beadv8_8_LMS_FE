import type { ChatCards, ChatStreamEvent, FaqSource } from './types'

/** SSE 메시지 하나(이벤트 이름과 data 원문) */
export type SseMessage = { event: string; data: string }

/**
 * text/event-stream을 조각 단위로 받아 메시지로 바꾸는 파서(WHATWG SSE 형식 중 event·data만 쓴다).
 * 네트워크 조각은 줄 중간이나 \r\n 사이에서 끊길 수 있어 다 끝나지 않은 줄은 다음 조각까지 들고 있는다.
 * - 줄바꿈은 \r\n, \n, \r 모두 받는다
 * - data 줄이 여러 개면 \n으로 잇는다. 콜론 뒤 공백 하나는 뺀다
 * - 빈 줄에서 메시지를 내보낸다. data가 없는 메시지는 버린다. event가 없으면 'message'다
 * - ':'로 시작하는 줄(주석)과 모르는 필드(id, retry 등)는 무시한다
 */
export function createSseParser() {
  let buffer = ''
  let event = ''
  let data: string[] = []
  let hasData = false

  const takeLine = (line: string, out: SseMessage[]) => {
    if (line === '') {
      if (hasData)
        out.push({ event: event || 'message', data: data.join('\n') })
      event = ''
      data = []
      hasData = false
      return
    }
    if (line.startsWith(':')) return
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') {
      data.push(value)
      hasData = true
    }
  }

  return {
    /** 받은 조각을 넣고, 이번에 끝난 메시지를 돌려준다 */
    push(chunk: string): SseMessage[] {
      buffer += chunk
      const out: SseMessage[] = []
      const lineBreak = /\r\n|\r|\n/g
      let start = 0
      for (let m = lineBreak.exec(buffer); m; m = lineBreak.exec(buffer)) {
        // 조각 끝의 \r은 다음 조각의 \n과 한 줄바꿈일 수 있어 기다린다.
        if (m[0] === '\r' && m.index === buffer.length - 1) break
        takeLine(buffer.slice(start, m.index), out)
        start = m.index + m[0].length
      }
      buffer = buffer.slice(start)
      return out
    },
    /** 스트림이 끝났을 때. 빈 줄 없이 끝난 마지막 메시지도 내보낸다 */
    end(): SseMessage[] {
      const out: SseMessage[] = []
      if (buffer !== '') takeLine(buffer.replace(/\r$/, ''), out)
      buffer = ''
      takeLine('', out)
      return out
    },
  }
}

/**
 * SSE 메시지를 챗봇 스트림 이벤트로 바꾼다. 모르는 이벤트나 읽을 수 없는 data는 null(무시한다).
 * BE가 새 이벤트를 더해도 화면이 깨지지 않게 한다.
 */
export function toChatStreamEvent(message: SseMessage): ChatStreamEvent | null {
  const data = parseJson(message.data)
  if (data === null) return null
  switch (message.event) {
    case 'token':
      return typeof data.text === 'string'
        ? { type: 'token', text: data.text }
        : null
    case 'cards':
      return { type: 'cards', cards: data as ChatCards }
    case 'done':
      return {
        type: 'done',
        sources: Array.isArray(data.sources)
          ? (data.sources as FaqSource[])
          : [],
        fallback: data.fallback === true,
      }
    case 'error':
      return {
        type: 'error',
        message: typeof data.message === 'string' ? data.message : '',
      }
    default:
      return null
  }
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}
