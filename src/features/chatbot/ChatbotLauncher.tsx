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
      {/* 두 아이콘을 겹쳐 두고 열림 여부로 회전·페이드 전환한다. 신호색 점은 닫혀 있을 때의 '대기 중' 램프다 */}
      <span className={`${styles.icon} ${styles.botIcon}`} aria-hidden="true">
        <ChatbotIcon size={28} />
      </span>
      <span className={`${styles.icon} ${styles.closeIcon}`} aria-hidden="true">
        <CloseIcon />
      </span>
      <span className={styles.tally} aria-hidden="true" />
    </button>
  )
}

/** 닫기 표시. 글자(✕)는 서체마다 굵기·위치가 달라 선으로 그린다 */
function CloseIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}
