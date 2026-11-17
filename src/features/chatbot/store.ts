import { create } from 'zustand'
import { appendItem, type ChatItem } from './conversation'
import {
  clearSavedConversation,
  loadConversation,
  saveConversation,
} from './persistence'

type ChatbotState = {
  /** 채팅창이 열려 있는지. 닫아도 대화는 남는다 */
  open: boolean
  /** 대화의 주인(로그인 회원). 없으면 대화를 두지 않는다 */
  memberId: number | null
  /** 대화(오래된 것부터). 이 탭의 sessionStorage에도 둔다(persistence.ts) */
  items: readonly ChatItem[]
}

/** 앱 전역 챗봇 상태. 창을 닫거나 다른 화면으로 옮겨도 대화가 남도록 컴포넌트 밖에 둔다 */
export const useChatbotStore = create<ChatbotState>(() => ({
  open: false,
  memberId: null,
  items: [],
}))

// 대화가 바뀔 때마다 저장한다(회원이 있을 때만).
useChatbotStore.subscribe((state, prev) => {
  if (state.items === prev.items || state.memberId === null) return
  saveConversation({ memberId: state.memberId, items: [...state.items] })
})

/** 진행 중인 요청. 새 대화·로그아웃 때 끊는다(상태가 아니라 그리지 않으므로 스토어 밖에 둔다) */
const running = new Map<string, AbortController>()

let nextId = 0

/** 말풍선 id. 새 대화 뒤에도 겹치지 않게 늘기만 한다 */
export function newItemId() {
  nextId++
  return `chatbot-${Date.now().toString(36)}-${nextId}`
}

export function openChatbot() {
  useChatbotStore.setState({ open: true })
}

export function closeChatbot() {
  useChatbotStore.setState({ open: false })
}

/** 좁은 화면(768px 미만) 기준. 창이 화면을 거의 다 덮는 폭이다(ChatbotWindow.module.css) */
const NARROW = '(max-width: 767px)'

/**
 * 추천 카드로 다른 화면에 갈 때: 좁은 화면에서는 창이 이동한 화면을 가리므로 닫는다(대화는 남는다).
 * 넓은 화면에서는 창을 연 채로 둔다.
 */
export function closeOnNarrowScreen() {
  if (typeof matchMedia === 'function' && matchMedia(NARROW).matches)
    closeChatbot()
}

export function toggleChatbot() {
  useChatbotStore.setState((s) => ({ open: !s.open }))
}

/** 대화 끝에 말풍선을 더한다 */
export function addItem(item: ChatItem) {
  useChatbotStore.setState((s) => ({ items: appendItem(s.items, item) }))
}

/** 대화를 바꾼다(conversation.ts의 전이 함수를 넘긴다) */
export function updateItems(
  update: (items: readonly ChatItem[]) => readonly ChatItem[],
) {
  useChatbotStore.setState((s) => ({ items: update(s.items) }))
}

/** id 말풍선의 요청을 시작한다. 돌려준 signal을 요청에 넘긴다 */
export function startRequest(id: string): AbortSignal {
  const controller = new AbortController()
  running.set(id, controller)
  return controller.signal
}

/** id 말풍선의 요청이 끝났다 */
export function finishRequest(id: string) {
  running.delete(id)
}

function abortAll() {
  for (const controller of running.values()) controller.abort()
  running.clear()
}

/** 새 대화: 진행 중인 요청을 끊고 대화를 비운다. 창은 그대로 둔다 */
export function clearConversation() {
  abortAll()
  useChatbotStore.setState({ items: [] })
}

/**
 * 로그인 회원의 대화를 시작한다(앱 시작·로그인). 같은 회원이면 그대로 두고, 이 탭에 저장한 그 회원의 대화가 있으면
 * 되살린다(새로고침). 다른 회원의 저장값은 버린다.
 */
export function startSession(memberId: number) {
  if (useChatbotStore.getState().memberId === memberId) return
  abortAll()
  const saved = loadConversation()
  if (saved && saved.memberId !== memberId) clearSavedConversation()
  useChatbotStore.setState({
    open: false,
    memberId,
    items: saved?.memberId === memberId ? saved.items : [],
  })
}

/** 로그아웃·로그인 만료: 진행 중인 요청을 끊고 대화와 저장값을 지우고 창을 닫는다 */
export function endSession() {
  abortAll()
  useChatbotStore.setState({ open: false, memberId: null, items: [] })
  clearSavedConversation()
}
