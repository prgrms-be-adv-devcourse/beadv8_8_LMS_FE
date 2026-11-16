import { useQuery } from '@tanstack/react-query'
import { useState, type FocusEvent, type KeyboardEvent } from 'react'
import { contentCategoriesQuery } from '../contentCategory'
import type { ContentCategory } from '../types'
import styles from './ContentCategoryPicker.module.css'

type ContentCategoryPickerProps = {
  /** 찾기 입력칸 id (Field의 label이 가리킨다) */
  id: string
  /** 고른 분야 code(고른 순서) */
  value: readonly string[]
  onChange: (codes: string[]) => void
  max: number
  /** 순서를 바꿀 수 있게 칩에 '앞으로' 버튼을 둔다 */
  reorderable?: boolean
  /**
   * 목록에 없는 분야의 이름(운영자가 끈 분야를 이미 고른 회원 등). 목록에도 여기에도 없으면 code를 그대로 보인다
   */
  known?: readonly ContentCategory[]
  placeholder?: string
  /** 입력칸에 펼칠 오류 상태·설명 연결 */
  inputProps?: {
    'aria-invalid'?: true
    'aria-describedby'?: string
  }
}

/** 한 번에 보이는 후보 수 */
const SUGGESTION_MAX = 12

/**
 * 콘텐츠 분야 고르기. 분야 목록을 한 번 받아 입력한 글자로 화면에서 거른다(이름·code, 대소문자 무시).
 * 입력칸에 포커스하면 후보가 보이고, 고른 분야는 후보에서 빠진다. Enter는 첫 후보를 고른다.
 * 고른 분야는 칩으로 보이고 지울 수 있다. 최대 개수면 더 고를 수 없게 입력칸을 막는다
 */
export function ContentCategoryPicker({
  id,
  value,
  onChange,
  max,
  reorderable = false,
  known = [],
  placeholder = '분야 찾기',
  inputProps,
}: ContentCategoryPickerProps) {
  const { data, error, refetch, isFetching } = useQuery(contentCategoriesQuery)
  const list = data ?? []
  // 받아 둔 목록이 있으면 백그라운드 다시 받기가 실패해도 그 목록으로 고른다
  const noList = data === undefined
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const full = value.length >= max

  const nameOf = (code: string) =>
    list.find((c) => c.code === code)?.name ??
    known.find((c) => c.code === code)?.name ??
    code
  const needle = text.trim().toLowerCase()
  const suggestions = list
    .filter(
      (c) =>
        !value.includes(c.code) &&
        (c.name.toLowerCase().includes(needle) ||
          c.code.toLowerCase().includes(needle)),
    )
    .slice(0, SUGGESTION_MAX)

  const add = (code: string) => {
    if (full || value.includes(code)) return
    onChange([...value, code])
    setText('')
  }
  const remove = (code: string) => onChange(value.filter((c) => c !== code))
  const moveForward = (index: number) => {
    const next = [...value]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    onChange(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // 폼 제출 대신 첫 후보를 고른다.
      e.preventDefault()
      if (needle && suggestions[0]) add(suggestions[0].code)
    } else if (e.key === 'Escape') setOpen(false)
  }
  // 후보 버튼은 누를 때 포커스를 가져가지 않게 해(onMouseDown) 입력칸에 머문다. 키보드로 후보에 가면 그대로 열어 둔다.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
  }

  return (
    <div className={styles.picker} onBlur={onBlur}>
      {value.length > 0 && (
        <ul className={styles.selected} aria-label="고른 콘텐츠 분야">
          {value.map((code, index) => {
            const name = nameOf(code)
            return (
              <li key={code} className="chip sm on">
                {name}
                {reorderable && index > 0 && (
                  <button
                    type="button"
                    className={styles.chipButton}
                    aria-label={`${name} 앞으로`}
                    onClick={() => moveForward(index)}
                  >
                    ←
                  </button>
                )}
                <button
                  type="button"
                  className={styles.chipButton}
                  aria-label={`${name} 빼기`}
                  onClick={() => remove(code)}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <input
        id={id}
        className="input"
        value={text}
        placeholder={full ? `최대 ${max}개를 골랐어요` : placeholder}
        disabled={full}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        {...inputProps}
      />
      {noList && error && !isFetching ? (
        // 목록을 받지 못하면 고를 수 없는 이유와 다시 시도를 보인다(열려 있지 않아도 보인다).
        <div className={styles.suggestions} role="alert">
          <span className="fine c-bad">
            콘텐츠 분야 목록을 불러오지 못했어요.
          </span>
          <button
            type="button"
            className="btn sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void refetch()}
          >
            다시 시도
          </button>
        </div>
      ) : (
        open &&
        !full && (
          <div
            className={styles.suggestions}
            role="group"
            aria-label="분야 후보"
          >
            {/* 처음 받는 중이거나 실패 뒤 다시 받는 중 */}
            {noList ? (
              <span className="fine" role="status">
                분야 목록을 불러오는 중…
              </span>
            ) : suggestions.length === 0 ? (
              <span className="fine">맞는 분야가 없어요.</span>
            ) : (
              suggestions.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className="chip sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(c.code)}
                >
                  {c.name}
                </button>
              ))
            )}
          </div>
        )
      )}
    </div>
  )
}
