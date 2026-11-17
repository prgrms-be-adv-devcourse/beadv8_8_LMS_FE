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
export const MAIN_MENU: readonly MenuOption[] = ['FAQ_QUESTION', 'FREE']

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

/** 화면에 쌓이는 말풍선 하나. id로 찾아 바꾸고, 이미 지운(새 대화) id로 늦게 온 결과는 무시한다 */
export type ChatItem = GuideItem | ChoiceItem | NoticeItem

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
