import { useMutation } from '@tanstack/react-query'
import { streamChat, streamFaqChat } from '@/entities/chatbot/stream'
import type { ChatTurn } from '@/entities/chatbot/types'
import {
  applyStreamEvent,
  endStream,
  failAnswer,
  historyFor,
  streamingAnswer,
} from './answer'
import { isBusy, type AskMode } from './conversation'
import { errorNotice, isAborted } from './errorNotice'
import {
  finishRequest,
  focusComposer,
  newItemId,
  setAskMode,
  startRequest,
  updateItems,
  useChatbotStore,
} from './store'

type Variables = {
  id: string
  mode: AskMode
  message: string
  history: ChatTurn[]
}

/**
 * 입력창의 질문을 보낸다. 내 말풍선과 받는 중인 답 말풍선을 더하고 스트림 조각을 답에 이어 붙인다.
 * - 자유 질문: 지난 대화(history, 이번 질문 제외)를 함께 보내고 cards 이벤트로 카드를 그린다
 * - FAQ 질문하기: 질문 하나만 보낸다. 보내고 나면 다음 질문은 다시 자유 질문이다
 * 결과는 말풍선 id로 스토어에 넣으므로 창을 닫아도 끝까지 받는다. 새 대화·로그아웃이면 스트림을 끊는다.
 * 429·400이면 스트림을 열지 않으므로 답 자리를 안내와 메뉴로 바꾼다(자동으로 다시 보내지 않는다).
 */
export function useAskQuestion() {
  const mutation = useMutation({
    mutationFn: async ({ id, mode, message, history }: Variables) => {
      const signal = startRequest(id)
      const onEvent: Parameters<typeof streamChat>[1]['onEvent'] = (event) =>
        updateItems((items) => applyStreamEvent(items, id, event))
      try {
        if (mode === 'FAQ') await streamFaqChat(message, { signal, onEvent })
        else await streamChat({ message, history }, { signal, onEvent })
        updateItems((items) => endStream(items, id))
      } finally {
        finishRequest(id)
      }
    },
    onError: (error, { id }) => {
      if (isAborted(error)) return
      const text = errorNotice(error, {
        fallback: '답을 받지 못했어요. 잠시 뒤 다시 물어봐 주세요.',
        invalid: '질문은 1~500자로 적어 주세요.',
      })
      updateItems((items) =>
        failAnswer(items, id, text, {
          notice: newItemId(),
          guide: newItemId(),
        }),
      )
    },
    onSettled: focusComposer,
  })

  /** 질문을 보낸다. 다른 답을 기다리는 중이면 보내지 않는다(입력창도 잠겨 있다) */
  return (message: string) => {
    const { items, mode } = useChatbotStore.getState()
    if (isBusy(items)) return
    const history = mode === 'FREE' ? historyFor(items) : []
    const id = newItemId()
    updateItems((current) => [
      ...current,
      { id: newItemId(), kind: 'question', mode, text: message },
      streamingAnswer(id, mode),
    ])
    setAskMode('FREE')
    mutation.mutate({ id, mode, message, history })
  }
}
