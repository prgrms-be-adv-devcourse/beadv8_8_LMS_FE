import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardRow } from './CardRow'

/** jsdom은 레이아웃을 계산하지 않아 목록의 너비·스크롤 위치를 정해 준다 */
function layout(
  el: HTMLElement,
  { scrollLeft = 0, clientWidth = 600, scrollWidth = 1200 },
) {
  Object.defineProperties(el, {
    clientWidth: { configurable: true, value: clientWidth },
    scrollWidth: { configurable: true, value: scrollWidth },
    scrollLeft: { configurable: true, writable: true, value: scrollLeft },
  })
}

afterEach(() => vi.restoreAllMocks())

function renderRow() {
  render(
    <CardRow label="추천 강의">
      <li>하나</li>
      <li>둘</li>
    </CardRow>,
  )
  return screen.getByRole('list', { name: '추천 강의' })
}

describe('추천 카드 한 줄', () => {
  it('넘치지 않으면 버튼을 두지 않는다', () => {
    renderRow()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('뒤에 더 볼 카드가 있으면 더 보기 버튼을 두고 누르면 너비만큼 넘긴다', async () => {
    const user = userEvent.setup()
    const list = renderRow()
    layout(list, { scrollLeft: 0 })
    const scrollBy = vi.fn()
    list.scrollBy = scrollBy as never
    fireEvent.scroll(list)

    expect(
      screen.queryByRole('button', { name: '추천 강의 앞으로' }),
    ).toBeNull()
    await user.click(screen.getByRole('button', { name: '추천 강의 더 보기' }))
    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: 480 }),
    )
  })

  it('끝까지 넘기면 앞으로 버튼만 남는다', () => {
    const list = renderRow()
    layout(list, { scrollLeft: 600 })
    fireEvent.scroll(list)
    expect(
      screen.getByRole('button', { name: '추천 강의 앞으로' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '추천 강의 더 보기' }),
    ).toBeNull()
  })
})
