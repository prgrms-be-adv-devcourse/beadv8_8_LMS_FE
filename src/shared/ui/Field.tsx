import type { ReactNode } from 'react'

type FieldProps = {
  id: string
  label: string
  /**
   * 있으면 hint 대신 빨간 글씨로 보여 주고 칸을 빨갛게 표시한다(.field.invalid).
   * 오류 문구 id는 `${id}-error`라 입력칸의 aria-describedby로 이을 수 있다.
   */
  error?: string
  hint?: ReactNode
  children: ReactNode
}

/** 이름표 + 입력 + 안내(또는 오류) 한 칸 */
export function Field({ id, label, error, hint, children }: FieldProps) {
  return (
    <div className={error ? 'field invalid' : 'field'}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span id={`${id}-error`} className="fine c-bad" role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="fine">{hint}</span>
      )}
    </div>
  )
}
