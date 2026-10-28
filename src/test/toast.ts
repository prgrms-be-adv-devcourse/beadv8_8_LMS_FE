import { screen, waitFor } from '@testing-library/react'
import { expect } from 'vitest'

const toasts = () =>
  screen.queryAllByRole('status').filter((el) => el.classList.contains('toast'))

/**
 * 성공 토스트가 정확히 이 문구로 뜨는지 확인한다.
 * HP 이동은 BE가 따로 처리해 응답 시점에 끝나지 않았을 수 있으므로 토스트에 HP 이야기가 없어야 한다.
 */
export async function expectSuccessToast(text: string) {
  await waitFor(() =>
    expect(toasts().map((el) => el.textContent)).toContain(text),
  )
  for (const el of toasts()) expect(el.textContent).not.toMatch(/HP/)
}
