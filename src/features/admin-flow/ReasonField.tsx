import styles from './ReasonField.module.css'
import type { useReasonInput } from './useReasonInput'

type ReasonFieldProps = ReturnType<typeof useReasonInput>['field'] & {
  label: string
  /** 누가 보는지 등 칸 아래 안내 */
  hint?: string
  placeholder?: string
}

/**
 * 사유 칸. 최대 글자 수를 넘겨 적을 수 없고, 안내와 글자 수(`${id}-hint`·`${id}-count`)를 칸 설명으로 잇는다.
 * 오류가 보이면 칸 설명은 오류 문구(`${id}-error`)다.
 */
export function ReasonField({
  id,
  label,
  hint,
  placeholder,
  value,
  max,
  error,
  inputProps,
  onChange,
}: ReasonFieldProps) {
  const describedBy = error
    ? `${id}-error`
    : [hint && `${id}-hint`, `${id}-count`].filter(Boolean).join(' ')
  return (
    <div className={error ? 'field invalid' : 'field'}>
      <label htmlFor={id}>{label}</label>
      <textarea
        {...inputProps}
        className="textarea"
        value={value}
        maxLength={max}
        aria-required="true"
        aria-describedby={describedBy}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <span id={`${id}-error`} className="fine c-bad" role="alert">
          {error}
        </span>
      )}
      <span className={styles.meta}>
        {hint && (
          <span id={`${id}-hint`} className="fine">
            {hint}
          </span>
        )}
        <span id={`${id}-count`} className={`fine num ${styles.count}`}>
          {value.length}/{max}자
        </span>
      </span>
    </div>
  )
}
