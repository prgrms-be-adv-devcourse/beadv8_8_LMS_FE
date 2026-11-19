import { act, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field } from '@/shared/ui/Field'
import { useFieldErrors } from './useFieldErrors'

const IDS = { amount: 'f-amount', note: 'f-note' } as const

function setup(errors: { amount?: string } = {}) {
  const { result } = renderHook(() =>
    useFieldErrors<'amount' | 'note'>({
      ids: IDS,
      order: ['amount', 'note'],
      errors,
    }),
  )
  return result
}

describe('useFieldErrors inputProps', () => {
  it('오류가 보이지 않을 때도 안내문이 있으면 aria-describedby로 잇는다', () => {
    const fields = setup()
    const props = fields.current.inputProps('amount', { hint: true })
    expect(props['aria-describedby']).toBe('f-amount-hint')
    expect(props['aria-invalid']).toBeUndefined()
  })

  it('오류가 보이면 오류 문구를 안내문과 함께 잇는다', () => {
    const fields = setup({ amount: '금액을 확인해 주세요' })
    act(() => {
      // 칸을 떠나면 오류가 보인다
      fields.current.inputProps('amount').onBlur()
    })
    const props = fields.current.inputProps('amount', { hint: true })
    expect(props['aria-describedby']).toBe('f-amount-hint f-amount-error')
    expect(props['aria-invalid']).toBe(true)
  })

  it('필수 칸은 aria-required를 붙인다', () => {
    const fields = setup()
    expect(
      fields.current.inputProps('amount', { required: true })['aria-required'],
    ).toBe(true)
    expect(fields.current.inputProps('amount')['aria-required']).toBeUndefined()
  })
})

describe('Field 안내문 id', () => {
  it('안내문에 `${id}-hint` id가 있어 입력칸과 이을 수 있다', () => {
    render(
      <Field id="f-amount" label="금액" hint="1,000원 단위">
        <input id="f-amount" />
      </Field>,
    )
    expect(screen.getByText('1,000원 단위')).toHaveAttribute(
      'id',
      'f-amount-hint',
    )
  })
})
