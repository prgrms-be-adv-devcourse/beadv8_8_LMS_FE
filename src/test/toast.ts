import { screen, waitFor } from '@testing-library/react'
import { expect } from 'vitest'

/**
 * 떠 있는 토스트. 안내는 늘 있는 알림 영역(role="status") 안에, 오류는 role="alert"로 그린다(shared/ui/Toast).
 * 알림 영역 밖에 그린 안내는 낭독기가 읽지 않으므로 찾지 않는다.
 */
export function toasts(): HTMLElement[] {
  return [
    ...screen
      .queryAllByRole('status')
      .flatMap((region) => [
        ...region.querySelectorAll<HTMLElement>(':scope > .toast'),
      ]),
    ...screen
      .queryAllByRole('alert')
      .filter((el) => el.classList.contains('toast')),
  ]
}

/** 떠 있는 토스트 문구 */
export const toastTexts = () => toasts().map((el) => el.textContent)

/**
 * 성공 토스트가 정확히 이 문구로 뜨는지 확인한다.
 * HP 이동은 BE가 따로 처리해 응답 시점에 끝나지 않았을 수 있으므로 토스트에 HP 이야기가 없어야 한다.
 */
export async function expectSuccessToast(text: string) {
  await waitFor(() => expect(toastTexts()).toContain(text))
  for (const el of toasts()) expect(el.textContent).not.toMatch(/HP/)
}

/** 오류 토스트(role="alert")가 이 문구로 뜨는지 확인한다 */
export async function expectErrorToast(text: string | RegExp) {
  await waitFor(() =>
    expect(
      screen
        .queryAllByRole('alert')
        .filter((el) => el.classList.contains('toast'))
        .map((el) => el.textContent),
    ).toContainEqual(
      typeof text === 'string' ? text : expect.stringMatching(text),
    ),
  )
}
