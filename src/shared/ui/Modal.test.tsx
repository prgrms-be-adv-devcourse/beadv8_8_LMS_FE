import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { Modal } from './Modal'

/** 버튼으로 모달을 열고, 모달의 닫기·Esc로 닫는다 */
function Harness({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        열기
      </button>
      <button type="button">모달 밖 버튼</button>
      {open && (
        <Modal
          title="확인"
          onClose={() => setOpen(false)}
          footer={
            <button type="button" onClick={() => setOpen(false)}>
              취소
            </button>
          }
        >
          {children}
        </Modal>
      )}
    </>
  )
}

async function open(children: ReactNode) {
  const user = userEvent.setup()
  render(<Harness>{children}</Harness>)
  await user.click(screen.getByRole('button', { name: '열기' }))
  return user
}

describe('모달 포커스', () => {
  it('열면 입력 칸이 있어도 모달 자체에 포커스를 주고(키보드가 저절로 올라오지 않게), Tab을 누르면 첫 요소로 간다', async () => {
    const user = await open(
      <>
        <p>안내</p>
        <input aria-label="사유" />
      </>,
    )
    expect(screen.getByRole('dialog', { name: '확인' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus()
  })

  it('이미 autoFocus가 있는 칸은 그대로 둔다', async () => {
    await open(
      <>
        <input aria-label="첫 칸" />
        <input aria-label="둘째 칸" autoFocus />
      </>,
    )
    expect(screen.getByLabelText('둘째 칸')).toHaveFocus()
  })

  it('Tab·Shift+Tab은 모달 밖으로 나가지 않고 처음과 끝을 돈다', async () => {
    const user = await open(<input aria-label="사유" />)
    const close = screen.getByRole('button', { name: '닫기' })
    const cancel = screen.getByRole('button', { name: '취소' })

    // 모달 → 닫기(처음) → 입력 칸 → 취소(마지막) → 닫기(처음)로 돈다
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('사유')).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(cancel).toHaveFocus()
    expect(
      screen.getByRole('button', { name: '모달 밖 버튼' }),
    ).not.toHaveFocus()
  })

  it('모달에서 Shift+Tab을 누르면 모달 안 마지막 요소로 간다', async () => {
    const user = await open(<p>정말 할까요?</p>)
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: '취소' })).toHaveFocus()
  })

  it('닫으면(닫기·Esc) 연 버튼으로 포커스를 돌려준다', async () => {
    const user = await open(<input aria-label="사유" />)
    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '열기' })).toHaveFocus(),
    )

    await user.click(screen.getByRole('button', { name: '열기' }))
    expect(screen.getByRole('dialog', { name: '확인' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '열기' })).toHaveFocus(),
    )
  })
})
