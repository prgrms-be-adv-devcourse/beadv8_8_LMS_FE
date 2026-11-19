import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Pager } from './Pager'

function setup(page: number, totalPages = 3) {
  const onChange = vi.fn()
  render(<Pager page={page} totalPages={totalPages} onChange={onChange} />)
  return {
    onChange,
    prev: screen.getByRole('button', { name: '이전' }),
    next: screen.getByRole('button', { name: '다음' }),
  }
}

describe('Pager', () => {
  it('첫 쪽의 이전은 aria-disabled로 막혀 눌러도 쪽을 바꾸지 않고, 포커스는 그대로 남는다', async () => {
    const { onChange, prev, next } = setup(0)
    expect(prev).toHaveAttribute('aria-disabled', 'true')
    expect(next).not.toHaveAttribute('aria-disabled')

    await userEvent.click(prev)
    expect(onChange).not.toHaveBeenCalled()
    expect(prev).toHaveFocus()
  })

  it('끝 쪽의 다음은 aria-disabled로 막혀 눌러도 쪽을 바꾸지 않는다', async () => {
    const { onChange, prev, next } = setup(2)
    expect(next).toHaveAttribute('aria-disabled', 'true')
    expect(prev).not.toHaveAttribute('aria-disabled')

    await userEvent.click(next)
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.click(prev)
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('가운데 쪽은 앞뒤로 옮긴다', async () => {
    const { onChange, prev, next } = setup(1)
    await userEvent.click(next)
    await userEvent.click(prev)
    expect(onChange.mock.calls).toEqual([[2], [0]])
  })

  it('쪽 위치를 문장으로 읽는다', () => {
    setup(1, 5)
    expect(screen.getByText('전체 5쪽 중 2쪽')).toHaveClass('sr-only')
    expect(screen.getByText('2 / 5')).toHaveAttribute('aria-hidden', 'true')
  })

  it('한 쪽뿐이면 그리지 않는다', () => {
    render(<Pager page={0} totalPages={1} onChange={() => {}} />)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})
