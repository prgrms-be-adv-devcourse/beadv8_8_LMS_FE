import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoadError } from './QueryState'

describe('LoadError', () => {
  it('첫 조회 실패는 알림(role="alert")으로 그려 나타날 때 바로 읽힌다', () => {
    render(<LoadError error={new Error('서버 오류예요.')} retry={() => {}} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('불러오지 못했어요')
    expect(alert).toHaveTextContent('서버 오류예요.')
  })
})
