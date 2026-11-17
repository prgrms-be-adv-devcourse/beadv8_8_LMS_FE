import { openStream } from '@/shared/api/stream'
import { createSseParser, toChatStreamEvent } from './sse'
import type { ChatRequest, ChatStreamEvent } from './types'

type StreamOptions = {
  signal?: AbortSignal
  onEvent: (event: ChatStreamEvent) => void
}

/**
 * 자유 질문을 스트림으로 보낸다(POST /chatbot/messages/stream). 지난 대화(history)를 함께 보내고,
 * 추천을 부르면 cards 이벤트가 온다.
 */
export function streamChat(request: ChatRequest, options: StreamOptions) {
  return readStream('/chatbot/messages/stream', request, options)
}

/**
 * FAQ에서만 찾아 답하는 질문을 스트림으로 보낸다(POST /chatbot/chat/faq/stream, BE ApiV1ChatbotChatController).
 * 대화 기억이 없어 질문 하나만 보내고, 카드는 오지 않는다(token·done·error).
 */
export function streamFaqChat(message: string, options: StreamOptions) {
  return readStream('/chatbot/chat/faq/stream', { message }, options)
}

/**
 * 스트림 요청을 보내고 이벤트가 올 때마다 onEvent를 부른다.
 * HTTP 상태를 먼저 확인하고, 2xx가 아니면(429·400 등) 스트림을 열지 않고 ApiError를 던진다.
 * 스트림이 끝나면 resolve한다. done·error 없이 끊겼는지는 부르는 쪽이 받은 이벤트로 판단한다.
 * signal로 중단하면 AbortError(DOMException)를 던진다.
 */
async function readStream(
  path: string,
  body: Record<string, unknown>,
  { signal, onEvent }: StreamOptions,
): Promise<void> {
  const res = await openStream(path, { body, signal })
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const parser = createSseParser()
  const emit = (messages: ReturnType<typeof parser.push>) => {
    for (const message of messages) {
      const event = toChatStreamEvent(message)
      if (event) onEvent(event)
    }
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    emit(parser.push(decoder.decode(value, { stream: true })))
  }
  emit(parser.push(decoder.decode()))
  emit(parser.end())
}
