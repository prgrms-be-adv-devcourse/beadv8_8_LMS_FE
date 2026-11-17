import { MESSAGE_MAX_LENGTH, textLength, truncateText } from './text'
import type { ChatTurn } from './types'

/**
 * 자유 질문 요청의 history 한도(BE docs/api/chatbot.md 4절). 넘기면 400 INVALID_CHAT_HISTORY라 보내기 전에 맞춘다.
 * BE는 50개까지 받지만 최근 12개만 쓰므로 12개만 보낸다.
 */
export const HISTORY_LIMITS = {
  entries: 12,
  userLength: MESSAGE_MAX_LENGTH,
  assistantLength: 2000,
  totalLength: 8000,
} as const

/**
 * 화면의 지난 대화(오래된 것부터)로 보낼 history를 만든다. 이번 질문은 넣지 않는다(부르는 쪽이 빼고 넘긴다).
 * - 내용이 비었거나 공백뿐인 줄은 뺀다
 * - USER는 500자, ASSISTANT는 2,000자까지 자른다
 * - 최근 12개만 남기고, 글자 수 합이 8,000자를 넘으면 오래된 것부터 뺀다
 */
export function buildHistory(turns: readonly ChatTurn[]): ChatTurn[] {
  const recent = turns
    .filter((turn) => turn.content.trim() !== '')
    .slice(-HISTORY_LIMITS.entries)
    .map((turn) => ({
      role: turn.role,
      content: truncateText(
        turn.content,
        turn.role === 'USER'
          ? HISTORY_LIMITS.userLength
          : HISTORY_LIMITS.assistantLength,
      ),
    }))
  let total = recent.reduce((sum, turn) => sum + textLength(turn.content), 0)
  let start = 0
  while (total > HISTORY_LIMITS.totalLength) {
    total -= textLength(recent[start].content)
    start++
  }
  return recent.slice(start)
}
