import { useState, type ComponentProps } from 'react'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/entities/member/password'
import styles from './PasswordInput.module.css'

/**
 * 비밀번호 칸 + 보기/숨기기 토글. 토글 이름은 칸 이름과 겹치지 않게 늘 "비밀번호 보기"이고 눌림 상태(aria-pressed)로 알린다.
 * 마우스로 누를 때는 포커스를 칸에 남긴다(칸을 떠난 것으로 보고 오류를 띄우지 않게, 모바일 키보드가 내려가지 않게).
 */
export function PasswordInput({
  className = 'input',
  ...props
}: Omit<ComponentProps<'input'>, 'type'>) {
  const [shown, setShown] = useState(false)
  return (
    <div className={styles.wrap}>
      <input
        {...props}
        className={`${className} ${styles.input}`}
        type={shown ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        className={styles.toggle}
        aria-label="비밀번호 보기"
        aria-pressed={shown}
        aria-controls={props.id}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setShown((v) => !v)}
      >
        <EyeIcon off={shown} />
      </button>
    </div>
  )
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  )
}

/**
 * 비밀번호 규칙 충족 여부 목록. 조건은 passwordError(BE Password)와 같고 새 규칙을 만들지 않는다.
 * 비어 있으면 모두 아직(회색)으로 두고, 맞으면 체크로 바뀐다.
 */
export function PasswordRules({ value }: { value: string }) {
  const rules = [
    {
      label: `${PASSWORD_MIN}~${PASSWORD_MAX}자`,
      ok: value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX,
    },
    {
      label: '영문·숫자·특수문자만 (공백·한글 없이)',
      ok: /^[\x21-\x7E]+$/.test(value),
    },
    {
      label: '영문과 숫자를 하나 이상씩',
      ok: /[A-Za-z]/.test(value) && /[0-9]/.test(value),
    },
  ]
  return (
    <ul className={styles.rules} aria-label="비밀번호 규칙">
      {rules.map((rule) => (
        <li key={rule.label} className={rule.ok ? styles.ok : undefined}>
          <span className={styles.mark} aria-hidden="true" />
          {rule.label}
          <span className="sr-only">{rule.ok ? ' 충족' : ' 미충족'}</span>
        </li>
      ))}
    </ul>
  )
}
