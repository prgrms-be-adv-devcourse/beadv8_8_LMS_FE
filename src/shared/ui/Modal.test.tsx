import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('재생 컨트롤이 있는 영상도 Tab 순환에 들어간다(강의 미리보기)', () => {
    // 강의 미리보기 모달처럼 닫기 버튼과 영상만 있다. 영상이 순환에 없으면 닫기에서 Tab을 막고 닫기로 되돌려
    // 키보드로 재생 컨트롤에 갈 수 없다. jsdom은 영상을 포커스 대상으로 보지 않아 Tab 기본 동작을 막는지로 본다.
    render(
      <Modal title="미리보기" onClose={() => {}}>
        <video
          controls
          aria-label="미리보기 영상"
          src="https://cdn.test/a.mp4"
        />
      </Modal>,
    )
    const close = screen.getByRole('button', { name: '닫기' })
    close.focus()
    // 닫기 다음에 영상이 있으니 Tab 기본 동작(영상으로 이동)을 막지 않는다
    expect(fireEvent.keyDown(close, { key: 'Tab' })).toBe(true)
    // 맨 앞(닫기)에서 Shift+Tab은 마지막(영상)으로 보낸다
    expect(fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })).toBe(false)
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

  it('연 버튼이 사라졌으면(지운 목록 줄 등) 본문(main)으로 포커스를 돌려준다', async () => {
    const user = userEvent.setup()
    function RowHarness() {
      const [row, setRow] = useState(true)
      const [open, setOpen] = useState(false)
      return (
        <main tabIndex={-1}>
          {row && (
            <button type="button" onClick={() => setOpen(true)}>
              지우기
            </button>
          )}
          {open && (
            <Modal title="지울까요?" onClose={() => setOpen(false)}>
              <button
                type="button"
                onClick={() => {
                  setRow(false)
                  setOpen(false)
                }}
              >
                지우기 확인
              </button>
            </Modal>
          )}
        </main>
      )
    }
    render(<RowHarness />)
    await user.click(screen.getByRole('button', { name: '지우기' }))
    await user.click(screen.getByRole('button', { name: '지우기 확인' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())
  })
})

describe('모달 바깥 닫기', () => {
  const scrim = () => screen.getByRole('dialog').parentElement as HTMLElement

  it('바깥(덮개)을 눌렀다 떼면 닫힌다', async () => {
    const user = await open(<p>안내</p>)
    await user.click(scrim())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('안에서 누른 채 끌어 바깥에서 놓으면 닫히지 않는다', async () => {
    await open(<input aria-label="사유" />)
    // 글자를 고르며 끌면 누름은 칸에서, click은 둘을 함께 감싼 덮개에서 난다
    fireEvent.pointerDown(screen.getByLabelText('사유'))
    fireEvent.click(scrim())
    expect(screen.getByRole('dialog', { name: '확인' })).toBeInTheDocument()
  })

  it('dismissOnScrim={false}면 바깥을 눌러도 닫히지 않고 닫기·Esc로 닫힌다', async () => {
    const user = userEvent.setup()
    function FormHarness() {
      const [shown, setShown] = useState(true)
      return shown ? (
        <Modal
          title="입력"
          onClose={() => setShown(false)}
          dismissOnScrim={false}
        >
          <input aria-label="금액" />
        </Modal>
      ) : null
    }
    render(<FormHarness />)
    await user.click(scrim())
    expect(screen.getByRole('dialog', { name: '입력' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
