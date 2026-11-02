import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import {
  lectureHpTask,
  lectureHpTaskDb,
  lectureHpTaskHandlers,
  resetLectureHpTaskDb,
} from '@/test/lectureHpTaskMock'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

// 강의 HP 작업 API는 테스트 전용 목(src/test/lectureHpTaskMock.ts)이 BE처럼 응답한다.
beforeEach(() => {
  resetLectureHpTaskDb()
  server.use(...lectureHpTaskHandlers)
})

/** 처리 뒤 다시 불러오기까지 끝나야 다음 테스트로 요청이 새지 않는다 */
async function settle() {
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))
}

afterEach(async () => {
  await settle()
  queryClient.clear()
})

const list = () => screen.findByRole('list', { name: 'HP 작업 목록' })
const item = async (taskId: number) =>
  within(await list()).findByRole('listitem', { name: `HP 작업 #${taskId}` })
/** 상세 화면 머리글의 상태 배지 */
const statusPill = () =>
  screen.findByText(/멈춤|대기|처리 중|완료/, {
    selector: '.ph-actions .pill',
  })
const region = (name: string) => screen.findByRole('region', { name })
const RETRIED =
  '재시도를 요청했어요. 다음 재시도 배치(1분마다)가 같은 요청 ID로 다시 보내요.'

/** 상세 재시도 영역의 재시도 → 확인 모달의 재시도 */
async function confirmRetry() {
  await userEvent.click(
    within(await region('재시도')).getByRole('button', { name: '재시도' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'HP 작업을 재시도할까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '재시도' }))
}

describe('관리자 강의 HP 작업 목록', () => {
  it('운영 메뉴에서 들어가 멈춘 작업을 최신순으로 보고 유형·목적·금액·마지막 실패를 설명한다', async () => {
    renderApp('/admin/hp-tasks', 'ADMIN')

    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(
      within(nav).getByRole('link', { name: '강의 HP 작업' }),
    ).toHaveAttribute('href', '/admin/hp-tasks')
    expect(
      await screen.findByRole('heading', { level: 1, name: '강의 HP 작업' }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: '작업 상태' })).getByRole(
        'button',
        { name: '멈춤' },
      ),
    ).toHaveAttribute('aria-pressed', 'true')

    const release = await item(72)
    expect(within(release).getByText('멈춤')).toHaveClass('pill', 'bad')
    expect(release).toHaveTextContent('#72 반환 · 구매 취소 반환')
    expect(release).toHaveTextContent(
      '주문 #601 · 항목 #702 · 구매자 회원 #32 · 9,000 HP',
    )
    expect(release).not.toHaveTextContent('판매자')
    expect(release).toHaveTextContent(
      /시도 2회 · 마지막 실패 10\/16\(금\) 10:01 · 남은 보류 HP가 없어요\(이미 정산·반환됨\) \(HOLD_ALREADY_CLOSED\)/,
    )
    expect(within(release).getByRole('link', { name: '상세' })).toHaveAttribute(
      'href',
      '/admin/hp-tasks/72',
    )

    const payout = await item(71)
    expect(payout).toHaveTextContent('#71 지급 · 판매자 지급')
    expect(payout).toHaveTextContent(
      '구매자 회원 #31 · 판매자 회원 #21 · 15,000 HP',
    )
    expect(payout).toHaveTextContent(
      '지급액이 주문 금액과 맞지 않아요 (PAYOUT_AMOUNT_MISMATCH)',
    )

    // 최신 작업순(BE가 정해 정렬은 보내지 않는다)
    expect(
      within(await list())
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('aria-label')),
    ).toEqual(['HP 작업 #72', 'HP 작업 #71'])
    expect(lectureHpTaskDb.listCalls[0]).toBe('status=DEAD&page=0&size=20')
  })

  it('상태·유형을 바꾸면 URL에 두고 그 조건의 첫 페이지를 요청한다', async () => {
    const router = renderApp('/admin/hp-tasks', 'ADMIN')
    const user = userEvent.setup()
    await item(72)
    const group = screen.getByRole('group', { name: '작업 상태' })

    await user.click(within(group).getByRole('button', { name: '대기' }))
    expect(router.state.location.search).toBe('?status=PENDING')
    const pending = await item(73)
    expect(within(pending).getByText('대기')).toHaveClass('pill', 'warn')
    expect(pending).toHaveTextContent('10/16(금) 10:08 다음 시도')
    expect(pending).toHaveTextContent(
      '지갑이 없어요(일시 오류) (WALLET_NOT_FOUND)',
    )

    await user.selectOptions(screen.getByLabelText('작업 유형'), 'HOLD')
    expect(router.state.location.search).toBe('?status=PENDING&taskType=HOLD')
    expect(
      await screen.findByText('다음 시도를 기다리는 작업이 없어요'),
    ).toBeInTheDocument()

    await user.click(within(group).getByRole('button', { name: '전체' }))
    expect(router.state.location.search).toBe('?status=ALL&taskType=HOLD')
    const hold = await item(74)
    expect(within(hold).getByText('완료')).toHaveClass('pill', 'ok')
    expect(hold).toHaveTextContent('#74 보류 · 주문 보류')
    expect(lectureHpTaskDb.listCalls).toEqual([
      'status=DEAD&page=0&size=20',
      'status=PENDING&page=0&size=20',
      'status=PENDING&taskType=HOLD&page=0&size=20',
      // 전체는 상태를 보내지 않는다
      'taskType=HOLD&page=0&size=20',
    ])
  })

  it('페이지는 URL ?page=로 두고 그 페이지를 요청한다', async () => {
    const pages: string[] = []
    server.use(
      http.get('*/api/v1/lectures/admin/hp-tasks', ({ request }) => {
        const url = new URL(request.url)
        pages.push(
          `${url.searchParams.get('page')}/${url.searchParams.get('size')}`,
        )
        return rs({
          content: [lectureHpTaskDb.items[0]],
          page: {
            size: 20,
            number: Number(url.searchParams.get('page')),
            totalElements: 41,
            totalPages: 3,
          },
        })
      }),
    )
    const router = renderApp('/admin/hp-tasks?page=2', 'ADMIN')
    await item(71)
    expect(pages[0]).toBe('1/20')
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    await waitFor(() => expect(router.state.location.search).toBe('?page=3'))
    await waitFor(() => expect(pages.at(-1)).toBe('2/20'))
  })

  it('멈춘 작업이 없으면 빈 상태를 보여 준다', async () => {
    resetLectureHpTaskDb([])
    renderApp('/admin/hp-tasks', 'ADMIN')
    expect(
      await screen.findByText('자동 처리가 멈춘 작업이 없어요'),
    ).toBeInTheDocument()
  })

  it('목록에서 상세를 열 수 있다', async () => {
    const router = renderApp('/admin/hp-tasks', 'ADMIN')
    await userEvent.click(
      within(await item(72)).getByRole('link', { name: '상세' }),
    )
    expect(router.state.location.pathname).toBe('/admin/hp-tasks/72')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'HP 작업 #72' }),
    ).toBeInTheDocument()
  })
})

describe('관리자 강의 HP 작업 상세', () => {
  it('작업·처리 상태·시도 이력을 보여 준다', async () => {
    renderApp('/admin/hp-tasks/72', 'ADMIN')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'HP 작업 #72' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '← 강의 HP 작업' }),
    ).toHaveAttribute('href', '/admin/hp-tasks')
    expect(await statusPill()).toHaveTextContent('멈춤')

    const summary = await region('작업')
    expect(summary).toHaveTextContent('반환 · 구매 취소 반환')
    expect(summary).toHaveTextContent('9,000 HP')
    expect(summary).toHaveTextContent('주문 #601 · 항목 #702')
    expect(summary).toHaveTextContent('회원 #32')
    expect(summary).toHaveTextContent('LECTURE-CANCEL-702')
    expect(summary).not.toHaveTextContent('판매자')

    const state = await region('처리 상태')
    expect(state).toHaveTextContent('누적 2회 · 이번 자동 재시도 2회')
    expect(state).toHaveTextContent(
      '10/16(금) 10:01 · 남은 보류 HP가 없어요(이미 정산·반환됨) (HOLD_ALREADY_CLOSED)',
    )
    expect(state).not.toHaveTextContent('다음 시도')
    expect(state).not.toHaveTextContent('관리자 재시도')

    const attempts = screen.getByRole('table', { name: '시도 이력' })
    const first = within(attempts).getByRole('row', { name: '1회차 시도' })
    expect(first).toHaveTextContent('결과 모름(재시도)')
    expect(first).toHaveTextContent(
      'UNKNOWN_RESULT (지갑 코드 HP_LOCK_TIMEOUT)',
    )
    expect(first).toHaveTextContent('BillingCallException: 503')
    const second = within(attempts).getByRole('row', { name: '2회차 시도' })
    expect(second).toHaveTextContent('있어서는 안 되는 결과')
    // 변환 전 코드가 같으면 다시 적지 않는다
    expect(second).not.toHaveTextContent('지갑 코드')

    expect(
      within(await region('재시도')).getByRole('button', { name: '재시도' }),
    ).toBeEnabled()
  })

  it('HP 작업으로 옮겨 온 지급은 이력이 없는 실패 횟수를 안내한다', async () => {
    renderApp('/admin/hp-tasks/71', 'ADMIN')
    const attempts = await region('시도 이력')
    expect(attempts).toHaveTextContent('아직 시도한 기록이 없어요.')
    expect(attempts).toHaveTextContent(
      '이력이 없는 1회는 HP 작업으로 옮기기 전 지급 배치에서 실패한 횟수예요.',
    )
    expect(await region('작업')).toHaveTextContent('판매자회원 #21')
  })

  it('대기 작업은 다음 시도 시각과 이번 주기의 시도 이력을 보여 주고 재시도 영역이 없다', async () => {
    renderApp('/admin/hp-tasks/73', 'ADMIN')
    expect(await statusPill()).toHaveTextContent('대기')
    const state = await region('처리 상태')
    expect(state).toHaveTextContent('다음 시도10/16(금) 10:08')
    const attempts = await region('시도 이력')
    expect(within(attempts).getAllByRole('row')).toHaveLength(4)
    // 시도 이력이 누적 횟수와 같으면 옮겨 온 실패 안내를 하지 않는다
    expect(attempts).not.toHaveTextContent('이력이 없는')
    expect(screen.queryByRole('region', { name: '재시도' })).toBeNull()
  })

  it('자동 재시도 한도를 넘겨 멈춘 일시 오류도 자동 재개를 약속하지 않는다', async () => {
    resetLectureHpTaskDb([
      lectureHpTask({
        id: 80,
        lastErrorCode: 'WALLET_NOT_FOUND',
        lastFailedAt: '2026-10-16T12:00:00',
      }),
    ])
    renderApp('/admin/hp-tasks/80', 'ADMIN')
    const state = await region('처리 상태')
    expect(state).toHaveTextContent(
      '지갑이 없어요(일시 오류) (WALLET_NOT_FOUND)',
    )
    expect(state).not.toHaveTextContent('자동으로 다시 시도')
    expect(await region('재시도')).toBeInTheDocument()
  })

  it('끝난 작업은 결과를 보여 주고 재시도 영역이 없다', async () => {
    renderApp('/admin/hp-tasks/74', 'ADMIN')
    expect(await statusPill()).toHaveTextContent('완료')
    expect(await region('작업')).toHaveTextContent('결과성공')
    expect(screen.queryByRole('region', { name: '재시도' })).toBeNull()
  })

  it('없는 작업이면(404) 안내한다', async () => {
    renderApp('/admin/hp-tasks/999', 'ADMIN')
    expect(await screen.findByText(/찾을 수 없/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '← 강의 HP 작업' }),
    ).toBeInTheDocument()
  })

  it('재시도하면 확인을 거쳐 대기로 바뀌고 관리자 재시도 기록이 남는다', async () => {
    renderApp('/admin/hp-tasks/72', 'ADMIN')
    await userEvent.click(
      within(await region('재시도')).getByRole('button', { name: '재시도' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'HP 작업을 재시도할까요?',
    })
    expect(dialog).toHaveTextContent(
      '반환 · 구매 취소 반환 · 주문 #601 · 항목 #702 (9,000 HP)',
    )
    expect(dialog).toHaveTextContent(/같은 요청 ID로 다시 보내서/)
    expect(dialog).toHaveTextContent(/HOLD_ALREADY_CLOSED/)
    await userEvent.click(
      within(dialog).getByRole('button', { name: '재시도' }),
    )

    expect(await screen.findByText(RETRIED)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(async () =>
      expect(await statusPill()).toHaveTextContent('대기'),
    )
    expect(screen.queryByRole('region', { name: '재시도' })).toBeNull()
    const state = await region('처리 상태')
    expect(state).toHaveTextContent('누적 2회 · 이번 자동 재시도 0회')
    expect(state).toHaveTextContent('1회 · 마지막 10/17(토) 09:00 · 관리자 #1')
    // 마지막 실패는 남는다
    expect(state).toHaveTextContent('HOLD_ALREADY_CLOSED')
    expect(lectureHpTaskDb.retryCalls).toEqual([72])
  })

  it('이미 재시도된 작업이면(409) 안내하고 최신 상태를 다시 불러온다', async () => {
    renderApp('/admin/hp-tasks/72', 'ADMIN')
    await region('재시도')
    // 화면을 그린 뒤 다른 관리자가 먼저 재시도했다.
    lectureHpTaskDb.items.find((t) => t.id === 72)!.status = 'PENDING'
    await confirmRetry()

    expect(
      await screen.findByText(
        '이미 재시도했거나 멈춘 작업이 아니에요. 최신 상태를 불러왔어요.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(async () =>
      expect(await statusPill()).toHaveTextContent('대기'),
    )
    expect(screen.queryByRole('region', { name: '재시도' })).toBeNull()
  })

  it('작업이 없으면(404) 안내하고 모달을 닫는다', async () => {
    renderApp('/admin/hp-tasks/72', 'ADMIN')
    await region('재시도')
    lectureHpTaskDb.items = lectureHpTaskDb.items.filter((t) => t.id !== 72)
    await confirmRetry()

    expect(
      await screen.findByText('HP 작업을 찾을 수 없어요.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('처리 중에는 모달을 닫고 다시 열어도 또 보내지 못한다', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      http.post('*/api/v1/lectures/admin/hp-tasks/72/retry', async () => {
        lectureHpTaskDb.retryCalls.push(72)
        await gate
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderApp('/admin/hp-tasks/72', 'ADMIN')
    await confirmRetry()
    await waitFor(() => expect(lectureHpTaskDb.retryCalls).toEqual([72]))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      within(await region('재시도')).getByRole('button', { name: '재시도' }),
    ).toBeDisabled()

    release()
    expect(await screen.findByText(RETRIED)).toBeInTheDocument()
    await settle()
    expect(lectureHpTaskDb.retryCalls).toEqual([72])
  })

  it('처리 중에 다른 메뉴로 갔다 돌아와도 같은 작업을 또 보내지 못한다', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      http.post('*/api/v1/lectures/admin/hp-tasks/72/retry', async () => {
        lectureHpTaskDb.retryCalls.push(72)
        await gate
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const router = renderApp('/admin/hp-tasks/72', 'ADMIN')
    await confirmRetry()
    await waitFor(() => expect(lectureHpTaskDb.retryCalls).toEqual([72]))

    // 응답 전에 다른 화면으로 갔다가 돌아온다(화면이 새로 만들어진다).
    await router.navigate('/admin/channels')
    // 이동은 비동기라 다른 화면이 실제로 그려진 것(상세 화면이 내려간 것)을 확인한다.
    await screen.findByRole('heading', { name: '채널 인증 심사' })
    expect(screen.queryByRole('heading', { name: 'HP 작업 #72' })).toBeNull()
    await router.navigate('/admin/hp-tasks/72')
    expect(
      within(await region('재시도')).getByRole('button', { name: '재시도' }),
    ).toBeDisabled()

    release()
    await settle()
    expect(lectureHpTaskDb.retryCalls).toEqual([72])
  })
})

describe('관리자 강의 HP 작업 접근', () => {
  it.each(['/admin/hp-tasks', '/admin/hp-tasks/72'])(
    '관리자가 아니면 %s를 열 수 없고 관리 API를 부르지 않는다',
    async (path) => {
      renderApp(path, 'VERIFIED_INFLUENCER')
      expect(await screen.findByText(/권한|볼 수 없/)).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: '강의 HP 작업' })).toBeNull()
      expect(lectureHpTaskDb.listCalls).toEqual([])
    },
  )
})
