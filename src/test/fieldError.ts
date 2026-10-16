import { expect } from 'vitest'

/** 칸에 오류가 표시됐는지: .field.invalid · aria-invalid · 오류 문구 연결(aria-describedby) */
export function expectFieldError(input: HTMLElement, message: string) {
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input.closest('.field')).toHaveClass('invalid')
  expect(input).toHaveAccessibleDescription(message)
}

/** 칸에 오류가 표시되지 않았는지 */
export function expectNoFieldError(input: HTMLElement) {
  expect(input).not.toHaveAttribute('aria-invalid')
  expect(input.closest('.field')).not.toHaveClass('invalid')
}

/** 검사 오류로 막힌 제출 버튼: 막힌 모양(aria-disabled)이지만 눌러서 첫 오류 칸을 안내할 수 있다 */
export function expectSubmitBlocked(button: HTMLElement) {
  expect(button).toBeEnabled()
  expect(button).toHaveAttribute('aria-disabled', 'true')
}

/** 제출할 수 있는 버튼 */
export function expectSubmitOpen(button: HTMLElement) {
  expect(button).toBeEnabled()
  expect(button).not.toHaveAttribute('aria-disabled')
}
