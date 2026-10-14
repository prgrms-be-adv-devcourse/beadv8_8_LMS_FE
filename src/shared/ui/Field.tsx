import type { ReactNode } from 'react'

type FieldProps = {
  id: string
  label: string
  /** 있으면 hint 대신 빨간 글씨로 보여 준다 */
  error?: string
  hint?: ReactNode
  children: ReactNode
}

/** 이름표 + 입력 + 안내(또는 오류) 한 칸 */
export function Field({ id, label, error, hint, children }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span className="fine c-bad" role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="fine">{hint}</span>
      )}
    </div>
  )
}
