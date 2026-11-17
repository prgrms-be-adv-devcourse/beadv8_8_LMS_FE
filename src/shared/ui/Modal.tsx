import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

type ModalProps = {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

/** Tab으로 갈 수 있는 요소 */
const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function tabbables(dialog: HTMLElement) {
  return [...dialog.querySelectorAll<HTMLElement>(TABBABLE)]
}

/** 같은 이름의 라디오 묶음. 브라우저는 묶음 안에서 Tab 한 번에 묶음을 벗어난다. */
function sameRadioGroup(a: Element, b: Element | null) {
  return (
    a instanceof HTMLInputElement &&
    b instanceof HTMLInputElement &&
    a.type === 'radio' &&
    b.type === 'radio' &&
    a.name !== '' &&
    a.name === b.name
  )
}

/**
 * 모달. Esc·바깥 클릭으로 닫는다.
 * 포커스: 열면 모달 자체(제목이 이름)로 옮긴다. 이미 안에 있으면(autoFocus 칸 등) 그대로 둔다.
 * 입력 칸에 바로 주지 않는 것은 모바일에서 키보드가 저절로 올라오지 않게 하려는 것이다.
 * Tab·Shift+Tab은 모달 안에서 돈다. 닫으면 열 때 포커스가 있던 곳(연 버튼)으로 돌려준다.
 */
export function Modal({ title, onClose, children, footer, wide }: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  // 그리기 전에 읽어야 한다. 그린 뒤에는 autoFocus 칸이 이미 포커스를 가져간다.
  const [opener] = useState(() => document.activeElement)

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) =>
      e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // 개발 모드(StrictMode)는 effect를 한 번 정리했다 다시 실행한다. 그때 포커스가 있던 칸으로 되돌린다.
  const focusedInside = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.contains(document.activeElement)) {
      const back = focusedInside.current
      ;(back && dialog.contains(back) ? back : dialog).focus()
    }
    return () => {
      const active = document.activeElement
      if (active instanceof HTMLElement && dialog.contains(active))
        focusedInside.current = active
      // 닫는 사이 다른 곳으로 포커스가 옮겨 갔으면(다른 모달·입력 칸) 빼앗지 않는다.
      const lost =
        !active || active === document.body || dialog.contains(active)
      if (lost && opener instanceof HTMLElement && opener.isConnected)
        opener.focus()
    }
  }, [opener])

  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    const dialog = dialogRef.current
    if (e.key !== 'Tab' || !dialog) return
    // 이 모달 안에 연 다른 모달이면 그 모달이 맡는다.
    if ((e.target as Element).closest('[role="dialog"]') !== dialog) return
    const items = tabbables(dialog)
    const active = document.activeElement
    if (items.length === 0) {
      e.preventDefault()
      dialog.focus()
      return
    }
    const i = items.indexOf(active as HTMLElement)
    const rest = e.shiftKey ? items.slice(0, i) : items.slice(i + 1)
    const atEdge =
      i === -1
        ? active === dialog
        : rest.every((el) => sameRadioGroup(el, active))
    if (!atEdge) return
    e.preventDefault()
    ;(e.shiftKey ? items[items.length - 1] : items[0]).focus()
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div
        ref={dialogRef}
        className={wide ? 'modal wide' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="닫기"
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  )
}
