import { useEffect, useId, useRef, useState } from 'react'
import { MESSAGE_MAX_LENGTH, textLength } from '@/entities/chatbot/text'
import { enterSends } from '@/shared/lib/enterToSend'
import styles from './Composer.module.css'
import { isBusy } from './conversation'
import { setAskMode, useChatbotStore } from './store'
import { useAskQuestion } from './useAskQuestion'

/** 입력칸이 이 높이까지 자라고 그 뒤로는 칸 안에서 스크롤한다 */
const MAX_HEIGHT_PX = 120

/**
 * 창 아래 입력창. 자유 질문이 기본이고, FAQ 질문하기를 고르면 다음 한 번은 FAQ로 보낸다(위에 표시, ✕로 취소).
 * Enter로 보내고 Shift+Enter·터치 기기의 Enter는 줄을 바꾸며, 한글 조합을 확정하는 Enter는 보내지 않는다
 * (채팅 입력창과 같은 `enterSends`). 1~500자(코드 포인트)만 보낸다.
 * 답을 기다리는 동안 잠근다.
 */
export function Composer() {
  const mode = useChatbotStore((s) => s.mode)
  const busy = useChatbotStore((s) => isBusy(s.items))
  const focusTick = useChatbotStore((s) => s.focusTick)
  const ask = useAskQuestion()
  const [value, setValue] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const counterId = useId()

  useEffect(() => {
    if (focusTick > 0) field.current?.focus()
  }, [focusTick])

  const placeholder = busy
    ? '답을 기다리는 중이에요…'
    : mode === 'FAQ'
      ? 'FAQ에서 찾을 질문을 적어 주세요'
      : '배우고 싶은 분야나 찾는 인플루언서를 구체적으로 적어 주세요. 자세히 적을수록 잘 맞춰 드려요'

  // 글에 맞춰 높이를 늘린다. 비어 있으면 안내 문구가 줄바꿈돼도 잘리지 않게 그 문구로 잰다
  // (브라우저마다 placeholder를 scrollHeight에 넣는지가 달라, 잠깐 값으로 넣어 재고 되돌린다).
  useEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    if (!value) el.value = placeholder
    const height = el.scrollHeight
    if (!value) el.value = ''
    el.style.height = `${Math.min(height, MAX_HEIGHT_PX)}px`
  }, [value, placeholder])

  const length = textLength(value.trim())
  const tooLong = length > MESSAGE_MAX_LENGTH
  const canSend = !busy && length > 0 && !tooLong

  const send = () => {
    if (!canSend) return
    ask(value.trim())
    setValue('')
  }

  return (
    <div className={styles.composer}>
      {mode === 'FAQ' && (
        <div className={styles.mode}>
          <span>자주 묻는 질문에서 찾아 답해요</span>
          <button
            type="button"
            className={styles.modeOff}
            aria-label="FAQ 질문 그만하기"
            onClick={() => setAskMode('FREE')}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <textarea
          ref={field}
          className={styles.field}
          rows={1}
          aria-label="챗봇에게 질문"
          aria-describedby={counterId}
          placeholder={placeholder}
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (!enterSends(e)) return
            e.preventDefault()
            send()
          }}
        />
        <button
          type="submit"
          className={styles.send}
          aria-label="보내기"
          disabled={!canSend}
        >
          <SendIcon />
        </button>
      </form>
      <p
        id={counterId}
        className={
          tooLong ? `${styles.counter} ${styles.over}` : styles.counter
        }
      >
        {tooLong
          ? `${MESSAGE_MAX_LENGTH}자까지 보낼 수 있어요 (${length}자)`
          : `${length}/${MESSAGE_MAX_LENGTH}`}
      </p>
    </div>
  )
}

/** 종이비행기. 목업 ICONS와 같은 규격(24 viewBox, stroke 2) */
function SendIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  )
}
