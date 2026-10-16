/** 화면 순서상 첫 오류 칸([aria-invalid="true"])에 포커스를 주고 보이도록 스크롤한다. 있으면 true */
export function focusFirstInvalid(container: HTMLElement | null) {
  const target = container?.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (!target) return false
  target.focus()
  // jsdom 등 scrollIntoView가 없는 환경도 있다.
  target.scrollIntoView?.({ block: 'center' })
  return true
}
