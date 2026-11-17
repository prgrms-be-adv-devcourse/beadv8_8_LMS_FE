/**
 * 챗봇 대화의 상태 전이. 화면·스토어와 떨어진 순수 함수라 단위 테스트한다(conversation.test.ts).
 * 대화는 서버가 저장하지 않아 FE가 갖고 있고(새로고침·로그아웃 때 비운다), 자유 질문 history도 여기서 만든다.
 */

/** 화면에 쌓이는 말풍선 하나. id로 찾아 바꾸고, 이미 지운(새 대화) id로 늦게 온 결과는 무시한다 */
export type ChatItem = { id: string; kind: 'notice'; text: string }

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
