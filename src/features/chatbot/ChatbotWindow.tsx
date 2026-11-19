import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { CHATBOT_WINDOW_ID } from './ChatbotLauncher'
import { ChatbotIcon } from './ChatbotIcon'
import styles from './ChatbotWindow.module.css'
import { Composer } from './Composer'
import { isBusy } from './conversation'
import { Greeting } from './Greeting'
import { MessageList } from './MessageList'
import {
  clearConversation,
  closeChatbot,
  closeOnNarrowScreen,
  useChatbotStore,
} from './store'
import { useHeaderBottom } from './useHeaderBottom'

const TITLE_ID = 'chatbot-title'

/**
 * 오른쪽 아래 버튼 위에 떠 있는 채팅창. 페이지를 가리는 모달이 아니라 왼쪽 페이지를 계속 보고 누를 수 있다
 * (배경을 어둡게 하지 않는다). 데스크톱은 헤더 아래부터 버튼 위까지 너비 50vw(400~720px), 768px 미만은 화면 거의 전체다.
 * 열리면 창으로 포커스를 옮기고, 창 안에서 Esc를 누르면 닫는다.
 * 헤더의 'FAQ ↗'는 자주 묻는 질문 페이지로 가는 링크다. 창은 연 채로 두고(좁은 화면에서는 닫는다) 대화에 남지 않는다.
 */
export function ChatbotWindow() {
  const items = useChatbotStore((s) => s.items)
  const busy = isBusy(items)
  const headerBottom = useHeaderBottom()
  const root = useRef<HTMLElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const resetButton = useRef<HTMLButtonElement>(null)
  const keepButton = useRef<HTMLButtonElement>(null)
  // 새 대화는 지금 대화를 되돌릴 수 없게 지우므로 한 번 더 묻는다.
  const [confirmingReset, setConfirmingReset] = useState(false)
  // 지운 뒤 입력칸으로 포커스한다. 답을 기다리던 중이면 지운 뒤에야 입력칸이 풀리므로 그린 뒤에 옮긴다.
  const focusComposer = useRef(false)

  useEffect(() => {
    root.current?.focus()
  }, [])

  useEffect(() => {
    if (confirmingReset) keepButton.current?.focus()
  }, [confirmingReset])

  useEffect(() => {
    if (!focusComposer.current) return
    focusComposer.current = false
    root.current?.querySelector('textarea')?.focus()
  }, [items])

  const cancelReset = () => {
    setConfirmingReset(false)
    resetButton.current?.focus()
  }
  const reset = () => {
    focusComposer.current = true
    clearConversation()
    setConfirmingReset(false)
  }

  // 새 말풍선이 생기거나 마지막 말풍선이 바뀌면(답 조각 등) 맨 아래로 내린다. 위쪽 말풍선이 바뀔 때는 그대로 둔다.
  const last = items.at(-1)
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items.length, last])

  return (
    <section
      ref={root}
      id={CHATBOT_WINDOW_ID}
      role="dialog"
      aria-labelledby={TITLE_ID}
      tabIndex={-1}
      className={styles.window}
      style={{ '--chatbot-top': `${headerBottom}px` } as CSSProperties}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        // 새 대화를 묻는 중이면 묻기만 접는다.
        if (confirmingReset) cancelReset()
        else closeChatbot()
      }}
    >
      <header className={styles.head}>
        <span className={styles.mark} aria-hidden="true">
          <ChatbotIcon size={20} />
        </span>
        <div className={styles.titles}>
          <h2 id={TITLE_ID}>합방 챗봇</h2>
          {/* 답을 기다리는 동안은 탤리 램프가 켜진다. 낭독은 말풍선의 상태 안내가 맡아 여기서는 숨긴다 */}
          <span
            className={busy ? `${styles.status} ${styles.live}` : styles.status}
            aria-hidden="true"
          >
            {busy ? '답하는 중' : '대기 중'}
          </span>
        </div>
        <Link
          to="/support/faq"
          className="btn ghost sm"
          aria-label="FAQ 전체 보기"
          onClick={closeOnNarrowScreen}
        >
          FAQ ↗
        </Link>
        <button
          ref={resetButton}
          type="button"
          className={`btn ghost sm ${styles.reset}`}
          disabled={items.length === 0}
          aria-expanded={confirmingReset}
          onClick={() => setConfirmingReset(true)}
        >
          새 대화
        </button>
        <button
          type="button"
          className={styles.close}
          aria-label="챗봇 창 닫기"
          onClick={closeChatbot}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      {confirmingReset && (
        <div className={styles.confirm} role="group" aria-label="새 대화 확인">
          <p>
            지금 대화를 지우고 새로 시작할까요? 지운 대화는 되돌릴 수 없어요.
          </p>
          <div className={styles.confirmActions}>
            <button
              ref={keepButton}
              type="button"
              className="btn ghost sm"
              onClick={cancelReset}
            >
              아니요
            </button>
            <button type="button" className="btn danger sm" onClick={reset}>
              지우고 새로 시작
            </button>
          </div>
        </div>
      )}
      <div ref={scroller} className={styles.body}>
        <Greeting active={items.length === 0} />
        <MessageList items={items} />
      </div>
      <Composer />
    </section>
  )
}
