import type { ChatItem } from './conversation'

/**
 * 대화를 이 탭의 sessionStorage에 둔다. 새로고침해도 남고, 탭·브라우저를 닫으면 사라진다.
 * 로그아웃·로그인 만료·계정 전환 때는 지운다(store.ts의 endSession). 다른 회원의 대화를 보이지 않게 회원 ID를 함께 둔다.
 * 저장소를 쓸 수 없으면(사생활 보호 모드 등) 저장하지 않고 메모리에만 둔다.
 */
const KEY = 'hapbang.chatbot'
/** 저장 형식. 말풍선 모양이 바뀌어 옛 값을 읽을 수 없으면 올린다(옛 값은 버린다) */
const VERSION = 1

export type SavedConversation = { memberId: number; items: ChatItem[] }

type Stored = SavedConversation & { version: number }

/** 저장해 둘 말풍선. 진행 중인 요청은 새로고침하면 끊기므로 끝난 말풍선만 남긴다 */
export function restorableItems(items: readonly ChatItem[]): ChatItem[] {
  return items.filter((item) => {
    switch (item.kind) {
      case 'guide':
      case 'choice':
      case 'notice':
        return true
      case 'recommendation':
        return item.result !== null
      default:
        return false
    }
  })
}

/** 저장한 값을 읽는다. 형식이 다르거나 읽을 수 없으면 null */
export function parseSaved(raw: string | null): SavedConversation | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<Stored>
    if (
      value.version !== VERSION ||
      typeof value.memberId !== 'number' ||
      !Array.isArray(value.items)
    )
      return null
    return { memberId: value.memberId, items: restorableItems(value.items) }
  } catch {
    return null
  }
}

export function loadConversation(): SavedConversation | null {
  try {
    return parseSaved(sessionStorage.getItem(KEY))
  } catch {
    return null
  }
}

export function saveConversation({ memberId, items }: SavedConversation) {
  try {
    const stored: Stored = {
      version: VERSION,
      memberId,
      items: restorableItems(items),
    }
    sessionStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    // 저장하지 못하면 이 페이지에서만 남는다.
  }
}

export function clearSavedConversation() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // 저장소를 쓸 수 없으면 지울 것도 없다.
  }
}
