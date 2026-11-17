import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import styles from './SearchCombobox.module.css'

type SearchComboboxProps<T> = {
  value: string
  /** 사용자가 고친 입력값. 고치면 후보 목록을 연다 */
  onChange: (value: string) => void
  /** 후보 목록을 열어 둘지. 부른 쪽은 열려 있을 때만 후보를 불러도 된다 */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 지금 입력값의 후보. 비어 있으면 목록을 그리지 않는다 */
  options: readonly T[]
  optionKey: (option: T) => string | number
  renderOption: (option: T) => ReactNode
  onPick: (option: T) => void
  /** 입력칸 이름 */
  label: string
  /** 후보 목록 이름 */
  listLabel: string
  placeholder?: string
  maxLength?: number
}

/**
 * 검색어 자동완성 입력칸(WAI-ARIA combobox, 목록 자동완성). 위·아래 화살표로 후보를 옮기고 Enter로 고르며, Esc·칸 밖을 누르면 닫는다.
 * 고른 후보가 없으면 Enter는 감싼 form의 검색을 그대로 한다. 포커스는 입력칸에 두고 고른 후보는 aria-activedescendant로 알린다.
 */
export function SearchCombobox<T>({
  value,
  onChange,
  open,
  onOpenChange,
  options,
  optionKey,
  renderOption,
  onPick,
  label,
  listLabel,
  placeholder,
  maxLength,
}: SearchComboboxProps<T>) {
  const listId = useId()
  const [active, setActive] = useState(-1)
  // 후보가 바뀌면(다른 입력값의 응답) 고른 후보를 지운다. 렌더 중에 이전 후보와 비교해 맞춘다
  const [seen, setSeen] = useState(options)
  if (seen !== options) {
    setSeen(options)
    setActive(-1)
  }
  const expanded = open && options.length > 0
  const optionId = (index: number) => `${listId}-${index}`

  const close = () => {
    setActive(-1)
    onOpenChange(false)
  }
  const pick = (option: T) => {
    close()
    onPick(option)
  }
  const move = (step: 1 | -1) => {
    const count = options.length
    if (!expanded) {
      // 닫혀 있으면 연다. 후보가 아직 없으면 열기만 한다(부른 쪽이 후보를 받는다)
      onOpenChange(true)
      setActive(count === 0 ? -1 : step === 1 ? 0 : count - 1)
      return
    }
    setActive((current) =>
      current === -1
        ? step === 1
          ? 0
          : count - 1
        : (current + step + count) % count,
    )
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (expanded || value.trim() !== '') e.preventDefault()
      move(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'Enter') {
      if (expanded && active >= 0) {
        e.preventDefault()
        pick(options[active])
      } else {
        close()
      }
    } else if (e.key === 'Escape' && expanded) {
      // 목록이 열려 있으면 닫기만 한다(검색칸의 Esc 지우기를 막는다)
      e.preventDefault()
      close()
    }
  }

  return (
    <div className={styles.box}>
      <input
        className="input"
        type="search"
        role="combobox"
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          expanded && active >= 0 ? optionId(active) : undefined
        }
        autoComplete="off"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          onOpenChange(true)
        }}
        onKeyDown={onKeyDown}
        onBlur={close}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={listLabel}
        className={styles.list}
        hidden={!expanded}
        // 후보를 눌러도 입력칸의 포커스를 잃지 않게 한다(blur로 닫히기 전에 click이 오게)
        onMouseDown={(e) => e.preventDefault()}
      >
        {expanded &&
          options.map((option, index) => (
            <li
              key={optionKey(option)}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className={styles.option}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(option)}
            >
              {renderOption(option)}
            </li>
          ))}
      </ul>
    </div>
  )
}
