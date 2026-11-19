import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toastTexts } from '@/test/toast'
import { Toast } from './Toast'
import { toast, toastDuration } from './toastStore'

afterEach(() => {
  vi.useRealTimers()
})

describe('토스트', () => {
  it('알림 영역(role="status")은 안내가 없을 때도 있고, 안내는 그 안에 그린다', () => {
    render(<Toast />)
    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()

    act(() => toast('저장했어요.'))
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('저장했어요.')
    expect(toastTexts()).toEqual(['저장했어요.'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('오류는 role="alert"로 그리고, 알림 영역은 비운다', () => {
    render(<Toast />)
    act(() => toast('요청을 처리하지 못했어요.', { tone: 'error' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      '요청을 처리하지 못했어요.',
    )
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('표시 시간은 글자 수에 비례하고 상한이 있으며, 오류는 더 오래 둔다', () => {
    expect(toastDuration('짧아요.')).toBeLessThan(
      toastDuration('조금 더 긴 안내 문구는 읽는 데 시간이 더 걸려요.'),
    )
    expect(toastDuration('같은 문구', 'error')).toBeGreaterThan(
      toastDuration('같은 문구'),
    )
    expect(toastDuration('가'.repeat(1000), 'error')).toBe(10_000)
  })

  it('시간이 지나면 사라지고, 포인터가 올라가 있는 동안은 멈춘다', () => {
    vi.useFakeTimers()
    render(<Toast />)
    const message = '저장했어요.'
    const life = toastDuration(message)

    act(() => toast(message))
    act(() => vi.advanceTimersByTime(life - 1000))
    fireEvent.pointerEnter(screen.getByText(message))
    act(() => vi.advanceTimersByTime(life * 2))
    expect(toastTexts()).toEqual([message])

    // 떠나면 남은 시간(1초)만큼 더 둔다
    fireEvent.pointerLeave(screen.getByText(message))
    act(() => vi.advanceTimersByTime(900))
    expect(toastTexts()).toEqual([message])
    act(() => vi.advanceTimersByTime(200))
    expect(toastTexts()).toEqual([])
  })
})
