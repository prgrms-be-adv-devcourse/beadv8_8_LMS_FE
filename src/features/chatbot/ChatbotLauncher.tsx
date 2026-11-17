import { useEffect, useRef } from 'react'
import { openLoginModal } from '@/shared/ui/loginModal'
import { ChatbotIcon } from './ChatbotIcon'
import styles from './ChatbotLauncher.module.css'
import { toggleChatbot } from './store'

export const CHATBOT_WINDOW_ID = 'chatbot-window'

/**
 * 화면 오른쪽 아래에 고정된 챗봇 버튼. 누를 때마다 바로 위의 채팅창을 열고 닫는다(열려 있으면 닫기 아이콘).
 * 챗봇 API는 모두 로그인이 필요해 비회원은 로그인 안내를 연다. 창을 닫으면 포커스를 이 버튼으로 돌려준다.
 */
export function ChatbotLauncher({
  signedIn,
  open,
}: {
  signedIn: boolean
  open: boolean
}) {
  const button = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(open)
  useEffect(() => {
    if (wasOpen.current && !open) button.current?.focus()
    wasOpen.current = open
  }, [open])

  return (
    <button
      ref={button}
      type="button"
      className={open ? `${styles.launcher} ${styles.open}` : styles.launcher}
      aria-label={open ? '챗봇 닫기' : '챗봇 열기'}
      aria-expanded={signedIn ? open : undefined}
      aria-controls={open ? CHATBOT_WINDOW_ID : undefined}
      onClick={() =>
        signedIn
          ? toggleChatbot()
          : openLoginModal('챗봇은 로그인한 뒤에 쓸 수 있어요.')
      }
    >
      {open ? (
        <span className={styles.closeMark} aria-hidden="true">
          ✕
        </span>
      ) : (
        <ChatbotIcon size={30} />
      )}
    </button>
  )
}
