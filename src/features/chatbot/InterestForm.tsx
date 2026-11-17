import { useId, useState } from 'react'
import { INTEREST_MAX_LENGTH, normalizeInterest } from '@/entities/chatbot/text'
import styles from './cards.module.css'

/**
 * 맞춤 재료가 없을 때(needsInterest) 관심사를 받는 칸. 앞뒤 공백을 뺀 1~100자만 보낸다.
 * 가장 마지막 말풍선일 때만 쓸 수 있다.
 */
export function InterestForm({
  active,
  onSubmit,
}: {
  active: boolean
  onSubmit: (interest: string) => void
}) {
  const [value, setValue] = useState('')
  const [invalid, setInvalid] = useState(false)
  const errorId = useId()
  return (
    <form
      className={styles.interest}
      onSubmit={(e) => {
        e.preventDefault()
        const interest = normalizeInterest(value)
        if (!interest) {
          setInvalid(true)
          return
        }
        onSubmit(interest)
      }}
    >
      <input
        className="input"
        aria-label="관심사"
        placeholder="예: 데이터 분석, 게임 방송"
        maxLength={INTEREST_MAX_LENGTH * 2}
        value={value}
        disabled={!active}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(e) => {
          setValue(e.target.value)
          setInvalid(false)
        }}
      />
      <button type="submit" className="btn sm primary" disabled={!active}>
        찾기
      </button>
      {invalid && (
        <span id={errorId} className={styles.fieldError} role="alert">
          관심사는 1~{INTEREST_MAX_LENGTH}자로 적어 주세요.
        </span>
      )}
    </form>
  )
}
