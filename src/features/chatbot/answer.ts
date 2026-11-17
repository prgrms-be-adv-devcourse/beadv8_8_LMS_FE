import { buildHistory } from '@/entities/chatbot/history'
import type { ChatStreamEvent, ChatTurn } from '@/entities/chatbot/types'
import {
  failureItems,
  replaceItem,
  updateItem,
  type AnswerItem,
  type ChatItem,
} from './conversation'

/**
 * 질문·답 말풍선의 상태 전이와 자유 질문 history. 화면과 떨어진 순수 함수라 단위 테스트한다(answer.test.ts).
 */

/** 답을 받다가 끊겼을 때(error 이벤트에 문구가 없거나 done 없이 스트림이 끝남) */
export const CUT_OFF_MESSAGE =
  '답을 끝까지 받지 못했어요. 잠시 뒤 다시 물어봐 주세요.'

/** 새로고침으로 받던 답이 끊겼을 때 */
export const RELOADED_MESSAGE = '화면을 새로 고쳐서 답을 끝까지 받지 못했어요.'

/** 받기 시작한 답 말풍선 */
export function streamingAnswer(
  id: string,
  mode: AnswerItem['mode'],
): AnswerItem {
  return {
    id,
    kind: 'answer',
    mode,
    status: 'streaming',
    text: '',
    cards: {},
    sources: [],
    errorMessage: null,
  }
}

/**
 * 스트림 이벤트 하나를 답에 반영한다.
 * - token: 글을 이어 붙인다 / cards: 카드를 둔다 / done: 끝(근거 FAQ)
 * - error: 받은 글은 남기고 안내를 붙인다
 * 이미 끝난 답에 늦게 온 이벤트는 무시한다.
 */
export function applyStreamEvent(
  items: readonly ChatItem[],
  id: string,
  event: ChatStreamEvent,
): readonly ChatItem[] {
  return updateItem(items, id, 'answer', (answer) => {
    if (answer.status !== 'streaming') return answer
    switch (event.type) {
      case 'token':
        return { ...answer, text: answer.text + event.text }
      case 'cards':
        return { ...answer, cards: event.cards }
      case 'done':
        return { ...answer, status: 'done', sources: event.sources }
      case 'error':
        return {
          ...answer,
          status: 'error',
          errorMessage: event.message || CUT_OFF_MESSAGE,
        }
    }
  })
}

/** 스트림이 끝났는데 done·error를 받지 못했으면 끊긴 것으로 본다 */
export function endStream(
  items: readonly ChatItem[],
  id: string,
): readonly ChatItem[] {
  return updateItem(items, id, 'answer', (answer) =>
    answer.status === 'streaming'
      ? { ...answer, status: 'error', errorMessage: CUT_OFF_MESSAGE }
      : answer,
  )
}

/**
 * 질문이 실패했을 때(받는 중인 답만 바꾼다). 받은 글이 있으면 그 글을 남기고 안내를 붙인다.
 * 글이 없으면(429·400처럼 스트림을 열지 못함) 답 자리를 안내와 메뉴로 바꾼다.
 */
export function failAnswer(
  items: readonly ChatItem[],
  id: string,
  message: string,
  ids: { notice: string; guide: string },
): readonly ChatItem[] {
  const answer = items.find((item) => item.id === id)
  if (answer?.kind !== 'answer' || answer.status !== 'streaming') return items
  if (answer.text.trim() !== '')
    return updateItem(items, id, 'answer', (a) => ({
      ...a,
      status: 'error',
      errorMessage: message,
    }))
  return replaceItem(items, id, failureItems(message, ids))
}

/** 새로고침으로 되살릴 때 받던 답은 끊긴 것으로 바꾼다 */
export function restoreAnswer(answer: AnswerItem): AnswerItem {
  return answer.status === 'streaming'
    ? { ...answer, status: 'error', errorMessage: RELOADED_MESSAGE }
    : answer
}

/**
 * 화면의 대화로 자유 질문 history를 만든다(오래된 것부터, 이번 질문은 부르는 쪽이 넣기 전에 만든다).
 * - 내가 쓴 질문(USER)과 챗봇 답의 글(ASSISTANT)만 넣는다. FAQ 질문하기로 주고받은 것도 대화라 넣는다
 * - 고른 것 말풍선·안내·추천 카드·근거 FAQ·오류 안내는 넣지 않는다
 * - 답의 글이 없는 질문(실패)은 뺀다
 * - 최근 12개·글자 수 한도는 buildHistory가 맞춘다
 */
export function historyFor(items: readonly ChatItem[]): ChatTurn[] {
  const turns: ChatTurn[] = []
  items.forEach((item, i) => {
    if (item.kind === 'question') {
      const next = items[i + 1]
      if (next?.kind === 'answer' && next.text.trim() !== '')
        turns.push({ role: 'USER', content: item.text })
    } else if (item.kind === 'answer' && item.text.trim() !== '') {
      turns.push({ role: 'ASSISTANT', content: item.text })
    }
  })
  return buildHistory(turns)
}
