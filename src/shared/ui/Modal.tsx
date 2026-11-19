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
  /**
   * 바깥(덮개)을 눌러 닫을지. 기본은 닫는다. 입력 폼 모달은 false로 두어 실수로 눌러 쓴 값을 잃지 않게 한다
   * (닫기 버튼·Esc로는 닫힌다).
   */
  dismissOnScrim?: boolean
}

/**
 * Tab으로 갈 수 있는 요소. 재생 컨트롤이 있는 영상·소리(강의 미리보기)와 iframe·summary·편집 영역도 넣는다.
 * 빠지면 Tab 순환이 그 요소를 건너뛰어 키보드로 재생 컨트롤에 갈 수 없다. tabindex가 음수면 뺀다.
 */
const TABBABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'video[controls]',
  'audio[controls]',
  'iframe',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
]
  .map((selector) => `${selector}:not([tabindex^="-"])`)
  .join(',')

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
 * 모달. Esc·바깥 클릭으로 닫는다. 바깥 클릭은 누르기 시작한 곳도 바깥일 때만 닫는다(안에서 글자를 고르며 끌다
 * 바깥에서 놓아도 닫히지 않게).
 * 포커스: 열면 모달 자체(제목이 이름)로 옮긴다. 이미 안에 있으면(autoFocus 칸 등) 그대로 둔다.
 * 입력 칸에 바로 주지 않는 것은 모바일에서 키보드가 저절로 올라오지 않게 하려는 것이다.
 * Tab·Shift+Tab은 모달 안에서 돈다. 닫으면 열 때 포커스가 있던 곳(연 버튼)으로 돌려주고, 연 버튼이 사라졌으면
 * (지운 목록 줄 등) 본문(main)으로 돌려준다.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
  dismissOnScrim = true,
}: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  // 덮개에서 누르기 시작했는지. 안에서 누른 채 끌어 바깥에서 놓으면 click이 덮개에서 나므로 시작 위치로 가린다.
  const pressedOnScrim = useRef(false)
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
      if (!lost) return
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
      else document.querySelector('main')?.focus({ preventScroll: true })
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
    <div
      className="scrim"
      onPointerDown={(e) => {
        pressedOnScrim.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        const outside = pressedOnScrim.current && e.target === e.currentTarget
        pressedOnScrim.current = false
        if (outside && dismissOnScrim) onClose()
      }}
    >
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
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  )
}
