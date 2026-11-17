import { useMutation } from '@tanstack/react-query'
import {
  requestInfluencerRecommendation,
  requestLectureRecommendation,
} from '@/entities/chatbot/api'
import {
  failureItems,
  isBusy,
  replaceItem,
  updateItem,
  type ChatItem,
  type RecommendTarget,
} from './conversation'
import { errorNotice, isAborted } from './errorNotice'
import {
  finishRequest,
  newItemId,
  startRequest,
  updateItems,
  useChatbotStore,
} from './store'

type Variables = {
  id: string
  target: RecommendTarget
  interest: string | null
}

/**
 * 추천받기(강의·인플루언서). 고른 것을 내 말풍선으로 남기고, 기다리는 말풍선을 더한 뒤 결과를 그 자리에 넣는다.
 * 결과는 말풍선 id로 스토어에 넣으므로 창을 닫아도 끝까지 받는다. 새 대화·로그아웃이면 요청을 끊고 결과를 버린다.
 * 실패하면 그 자리를 안내와 메뉴로 바꾼다(429는 기다릴 시간, 자동으로 다시 시도하지 않는다).
 */
export function useRecommend() {
  const mutation = useMutation({
    mutationFn: async ({ id, target, interest }: Variables) => {
      const signal = startRequest(id)
      try {
        return target === 'LECTURE'
          ? {
              target,
              result: await requestLectureRecommendation(interest, signal),
            }
          : {
              target,
              result: await requestInfluencerRecommendation(interest, signal),
            }
      } finally {
        finishRequest(id)
      }
    },
    onSuccess: (done, { id }) =>
      updateItems((items) =>
        updateItem(items, id, 'recommendation', (item) => ({
          ...item,
          ...done,
        })),
      ),
    onError: (error, { id }) => {
      if (isAborted(error)) return
      const text = errorNotice(error, {
        fallback: '추천을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
        invalid: '관심사는 앞뒤 공백을 빼고 1~100자로 적어 주세요.',
      })
      updateItems((items) =>
        replaceItem(
          items,
          id,
          failureItems(text, { notice: newItemId(), guide: newItemId() }),
        ),
      )
    },
  })

  /** choice: 내 말풍선에 남길 글(예: '강의 추천', '관심사: 데이터 분석') */
  return (target: RecommendTarget, interest: string | null, choice: string) => {
    // 다른 답을 기다리는 중이면 보내지 않는다(버튼도 잠겨 있다).
    if (isBusy(useChatbotStore.getState().items)) return
    const id = newItemId()
    const waiting: ChatItem =
      target === 'LECTURE'
        ? { id, kind: 'recommendation', target, interest, result: null }
        : { id, kind: 'recommendation', target, interest, result: null }
    updateItems((items) => [
      ...items,
      { id: newItemId(), kind: 'choice', text: choice },
      waiting,
    ])
    mutation.mutate({ id, target, interest })
  }
}
