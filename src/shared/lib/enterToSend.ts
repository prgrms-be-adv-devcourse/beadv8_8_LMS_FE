import type { KeyboardEvent } from 'react'

/**
 * 여러 줄 입력창(채팅·챗봇)에서 이 키가 보내기인지. Enter는 보내기, Shift+Enter는 줄바꿈이다.
 * - 한글 조합을 확정하는 Enter는 보내지 않는다. Safari는 조합이 끝난 뒤에 keydown이 와서 isComposing이
 *   false이므로 keyCode 229로도 가린다.
 * - 터치가 주 입력인 기기의 화면 키보드에는 Shift가 없어 줄을 바꿀 길이 없으므로, Enter는 줄바꿈으로 두고
 *   보내기 버튼으로만 보낸다. matchMedia가 없으면(jsdom) 데스크톱으로 본다.
 */
export function enterSends(e: KeyboardEvent<HTMLElement>) {
  return (
    e.key === 'Enter' &&
    !e.shiftKey &&
    !e.nativeEvent.isComposing &&
    e.keyCode !== 229 &&
    !touchFirst()
  )
}

function touchFirst() {
  return (
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  )
}
