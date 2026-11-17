import type {
  ChatCards,
  FaqSource,
  InfluencerRecommendation,
  LectureRecommendation,
} from '@/entities/chatbot/types'

/**
 * 챗봇 대화의 상태 전이. 화면·스토어와 떨어진 순수 함수라 단위 테스트한다(conversation.test.ts).
 * 대화는 서버가 저장하지 않아 FE가 갖고 있고(탭의 sessionStorage, 로그아웃 때 비운다), 자유 질문 history도 여기서 만든다.
 */

/** 챗봇 말풍선 안의 버튼(카톡 빠른 답장처럼 대화 안에서 고른다) */
export type MenuOption = 'FAQ_QUESTION' | 'LECTURE' | 'INFLUENCER' | 'FREE'

export const MENU_LABEL: Record<MenuOption, string> = {
  FAQ_QUESTION: 'FAQ 질문하기',
  LECTURE: '강의 추천',
  INFLUENCER: '인플루언서 추천',
  FREE: '자유 질문',
}

/** 처음 열었을 때와 결과 뒤에 다시 보여 주는 메뉴 */
export const MAIN_MENU: readonly MenuOption[] = [
  'FAQ_QUESTION',
  'LECTURE',
  'INFLUENCER',
  'FREE',
]

/** 챗봇의 정해진 안내 문구와 그 아래 버튼. history에 넣지 않는다 */
export type GuideItem = {
  id: string
  kind: 'guide'
  text: string
  options: readonly MenuOption[]
}

/** 사용자가 버튼으로 고른 것(내 말풍선). 직접 쓴 글이 아니라 history에 넣지 않는다 */
export type ChoiceItem = { id: string; kind: 'choice'; text: string }

/** 안내(호출 한도·오류). 대화가 아니라 history에 넣지 않는다 */
export type NoticeItem = { id: string; kind: 'notice'; text: string }

/** 추천받기 버튼의 대상 */
export type RecommendTarget = 'LECTURE' | 'INFLUENCER'

/**
 * 추천받기 결과(이유 붙은 카드). result가 null이면 기다리는 중이다. interest는 보낸 관심사(없으면 null)로,
 * 다시 시도할 때 같은 값으로 부른다. history에 넣지 않는다
 */
export type RecommendationItem = {
  id: string
  kind: 'recommendation'
  interest: string | null
} & (
  | { target: 'LECTURE'; result: LectureRecommendation | null }
  | { target: 'INFLUENCER'; result: InfluencerRecommendation | null }
)

/**
 * 질문을 보낼 곳
 * - FREE: 자유 질문(지난 대화를 함께 보내고 추천 카드가 올 수 있다)
 * - FAQ: FAQ에서만 찾아 답한다(질문 하나만 보낸다)
 */
export type AskMode = 'FREE' | 'FAQ'

/** 사용자가 입력창에 직접 쓴 질문(내 말풍선). 답을 받았으면 history에 USER로 넣는다 */
export type QuestionItem = {
  id: string
  kind: 'question'
  mode: AskMode
  text: string
}

/**
 * 챗봇의 답. 스트림 조각(token)을 이어 붙인다. 글이 있으면 history에 ASSISTANT로 넣는다(카드·근거·오류 안내는 넣지 않는다).
 * - streaming: 받는 중 / done: 끝 / error: 글을 받다가 실패(받은 글은 남기고 errorMessage를 붙인다)
 */
export type AnswerItem = {
  id: string
  kind: 'answer'
  mode: AskMode
  status: 'streaming' | 'done' | 'error'
  text: string
  /** 추천을 부른 종류의 카드(자유 질문만). cards 이벤트로만 그린다 */
  cards: ChatCards
  /** 답이 참고한 FAQ */
  sources: FaqSource[]
  errorMessage: string | null
}

/** 화면에 쌓이는 말풍선 하나. id로 찾아 바꾸고, 이미 지운(새 대화) id로 늦게 온 결과는 무시한다 */
export type ChatItem =
  | GuideItem
  | ChoiceItem
  | NoticeItem
  | RecommendationItem
  | QuestionItem
  | AnswerItem

/** 대화 끝에 말풍선을 더한다 */
export function appendItem(items: readonly ChatItem[], item: ChatItem) {
  return [...items, item]
}

/**
 * id인 말풍선을 바꾼다. 그 id가 없으면(새 대화로 지웠으면) 그대로 돌려준다.
 * kind가 다르면 바꾸지 않는다(같은 id를 다른 종류로 잘못 쓰는 것을 막는다).
 */
export function updateItem<K extends ChatItem['kind']>(
  items: readonly ChatItem[],
  id: string,
  kind: K,
  update: (item: Extract<ChatItem, { kind: K }>) => ChatItem,
): readonly ChatItem[] {
  const index = items.findIndex((item) => item.id === id)
  if (index === -1 || items[index].kind !== kind) return items
  const next = [...items]
  next[index] = update(items[index] as Extract<ChatItem, { kind: K }>)
  return next
}

/**
 * 말풍선의 버튼을 누를 수 있는지. 가장 마지막 말풍선의 버튼만 누를 수 있다(지난 버튼은 흐리게 남긴다).
 * id가 null이면 대화 맨 위 인사이고, 대화가 비어 있을 때만 누를 수 있다.
 */
export function isLatest(items: readonly ChatItem[], id: string | null) {
  return id === null ? items.length === 0 : items.at(-1)?.id === id
}

/** 버튼을 고르면: 고른 것을 내 말풍선으로 남기고 챗봇 안내를 붙인다(안내가 없는 버튼은 고른 것만) */
export function choose(
  items: readonly ChatItem[],
  option: MenuOption,
  ids: { choice: string; guide: string },
  guide?: Omit<GuideItem, 'id' | 'kind'>,
): ChatItem[] {
  const next: ChatItem[] = [
    ...items,
    { id: ids.choice, kind: 'choice', text: MENU_LABEL[option] },
  ]
  if (guide) next.push({ id: ids.guide, kind: 'guide', ...guide })
  return next
}

/** 답을 기다리는 말풍선이 있는지. 있으면 버튼·입력을 잠근다(같은 요청을 두 번 보내지 않게) */
export function isBusy(items: readonly ChatItem[]) {
  return items.some(
    (item) =>
      (item.kind === 'recommendation' && item.result === null) ||
      (item.kind === 'answer' && item.status === 'streaming'),
  )
}

/** id 말풍선을 여러 말풍선으로 바꾼다(실패한 요청을 안내로). id가 없으면 그대로 */
export function replaceItem(
  items: readonly ChatItem[],
  id: string,
  replacement: readonly ChatItem[],
): readonly ChatItem[] {
  const index = items.findIndex((item) => item.id === id)
  if (index === -1) return items
  return [...items.slice(0, index), ...replacement, ...items.slice(index + 1)]
}
