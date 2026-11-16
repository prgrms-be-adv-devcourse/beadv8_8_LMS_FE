import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse } from 'msw'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest'
import { queryClient } from '@/app/queryClient'
import {
  appearanceRun,
  hpReconciliationDb,
  hpReconciliationHandlers,
  lectureRun,
  resetHpReconciliationDb,
  running,
} from '@/test/hpReconciliationMock'
import { renderApp } from '@/test/renderApp'
import { server } from '@/test/server'

// HP 대사 API는 테스트 전용 목(src/test/hpReconciliationMock.ts)이 BE처럼 응답한다.
beforeEach(() => {
  resetHpReconciliationDb()
  server.use(...hpReconciliationHandlers)
})

afterEach(async () => {
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))
  queryClient.clear()
})

const region = (name: string) => screen.findByRole('region', { name })
const runButton = () => screen.findByRole('button', { name: '지금 실행' })
const toastText = () =>
  screen
    .queryAllByRole('status')
    .filter((el) => el.classList.contains('toast'))
    .map((el) => el.textContent)
const count = async (label: string) =>
  within(await region('마지막 결과')).getByRole('group', { name: label })

/** 실행 중 다시 읽기를 보는 테스트: 5초 간격을 시계로 넘긴다 */
function useFakeClock() {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
}

describe('관리자 HP 대사 마지막 결과', () => {
  it('운영 메뉴에서 들어가 강의 마지막 결과와 어긋난 건, 멈춘 작업 표시를 나눠 본다', async () => {
    const router = renderApp('/admin/hp-reconciliations', 'ADMIN')
    const user = userEvent.setup()

    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(within(nav).getByRole('link', { name: 'HP 대사' })).toHaveAttribute(
      'href',
      '/admin/hp-reconciliations',
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'HP 대사' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '강의' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    const summary = await region('마지막 결과')
    expect(within(summary).getByText('완료')).toHaveClass('pill', 'ok')
    expect(summary).toHaveTextContent('계기매일 배치')
    expect(summary).toHaveTextContent('시작11/15(일) 04:00')
    expect(summary).toHaveTextContent('끝11/15(일) 04:03')
    expect(await count('확인한 주문 항목')).toHaveTextContent('1,240건')
    expect(await count('어긋난 건')).toHaveTextContent('2건')
    expect(await count('멈춘 작업 있음')).toHaveTextContent('1건')

    const mismatches = await region('어긋난 건')
    const canceled = within(mismatches).getByRole('row', {
      name: '주문 항목 #702',
    })
    expect(within(canceled).getByText('보류 잔액 다름')).toHaveClass(
      'pill',
      'bad',
    )
    expect(canceled).toHaveTextContent('HOLD_BALANCE_MISMATCH')
    expect(canceled).toHaveTextContent('항목 #702주문 #601')
    expect(canceled).toHaveTextContent('구매 취소')
    // 상태 요약은 BE가 만든 문자열 그대로
    expect(canceled).toHaveTextContent(
      '항목 702 · 주문 601 · CANCELED · 9000 HP · 구매자 32 · 판매자 21',
    )
    expect(canceled).toHaveTextContent(
      '보류 9000 (HELD 9000) · 무효화 없음 · 지급 건 없음',
    )
    const walletOnly = within(mismatches).getByRole('row', {
      name: '주문 항목 #799',
    })
    expect(walletOnly).toHaveTextContent('지갑에만 있는 보류')
    expect(walletOnly).toHaveTextContent('항목 #799강의에 없음')
    expect(
      within(mismatches).queryByRole('row', { name: '주문 항목 #705' }),
    ).toBeNull()

    const dead = await region('멈춘 작업 있음')
    const deadRow = within(dead).getByRole('row', { name: '주문 항목 #705' })
    expect(within(deadRow).getByText('멈춘 작업 있음')).toHaveClass(
      'pill',
      'warn',
    )
    await user.click(
      within(dead).getByRole('link', { name: '강의 HP 작업에서 보기' }),
    )
    expect(router.state.location.pathname).toBe('/admin/hp-tasks')
    expect(
      await screen.findByRole('heading', { level: 1, name: '강의 HP 작업' }),
    ).toBeInTheDocument()
  })

  it('출연 탭은 URL에 두고 출연 결과(중단·실패 이유·대상)를 보이며 멈춘 작업은 출연 HP 작업으로 잇는다', async () => {
    hpReconciliationDb.latest.appearance = appearanceRun()
    const router = renderApp('/admin/hp-reconciliations', 'ADMIN')
    const user = userEvent.setup()
    await region('마지막 결과')

    await user.click(screen.getByRole('tab', { name: '출연' }))
    expect(router.state.location.search).toBe('?app=appearance')
    const panel = screen.getByRole('tabpanel')
    const summary = await within(panel).findByRole('region', {
      name: '마지막 결과',
    })
    expect(within(summary).getByText('중단')).toHaveClass('pill', 'warn')
    expect(summary).toHaveTextContent('계기관리자 실행 · 관리자 #9')
    expect(summary).toHaveTextContent(
      '실패 이유: 지갑 보류 목록 조회 실패: 503 Service Unavailable',
    )
    expect(await count('확인한 요청서·모집글')).toHaveTextContent('88건')

    const request = within(await region('어긋난 건')).getByRole('row', {
      name: '요청서 #55',
    })
    expect(request).toHaveTextContent('상태와 HP 작업 다름')
    expect(request).toHaveTextContent('출연 #120')
    expect(request).toHaveTextContent(
      '요청서 55 ACCEPTED · 출연 120 COMPLETED · 기대 지급 30000',
    )
    const dead = await region('멈춘 작업 있음')
    expect(
      within(dead).getByRole('row', { name: '모집글 #8' }),
    ).toHaveTextContent('멈춘 작업 있음')
    expect(
      within(dead).getByRole('link', { name: '출연 HP 작업에서 보기' }),
    ).toHaveAttribute('href', '/admin/appearance-hp-tasks')

    // 강의로 돌아가면 검색어를 지운다
    await user.click(screen.getByRole('tab', { name: '강의' }))
    expect(router.state.location.search).toBe('')
    expect(hpReconciliationDb.latestCalls.appearance).toBe(1)
  })

  it('실행 기록이 없으면(404) 빈 상태를 보이고 지금 실행하면 결과를 보인다', async () => {
    hpReconciliationDb.latest.lecture = null
    hpReconciliationDb.next.lecture = lectureRun({
      mismatchCount: 0,
      deadCount: 0,
      mismatches: [],
    })
    renderApp('/admin/hp-reconciliations', 'ADMIN')
    const user = userEvent.setup()

    expect(await screen.findByText('아직 실행한 적이 없어요')).toBeVisible()
    await user.click(await runButton())

    const summary = await region('마지막 결과')
    expect(summary).toHaveTextContent('계기관리자 실행 · 관리자 #1')
    expect(
      within(await region('어긋난 건')).getByText('어긋난 건이 없어요.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '멈춘 작업 있음' })).toBeNull()
    await waitFor(() =>
      expect(toastText()).toContain(
        '강의 HP 대사를 마쳤어요. 어긋난 건이 없어요.',
      ),
    )
    expect(hpReconciliationDb.runCalls.lecture).toBe(1)
  })
})

describe('관리자 HP 대사 지금 실행', () => {
  it('끝까지 비교하지 못하면(200 INCOMPLETE) 실패 이유를 보이고 안내한다', async () => {
    hpReconciliationDb.next.lecture = lectureRun({
      status: 'INCOMPLETE',
      failureReason: '지갑 조회 회로 열림',
      mismatches: [],
      mismatchCount: 0,
      deadCount: 0,
    })
    renderApp('/admin/hp-reconciliations', 'ADMIN')
    const user = userEvent.setup()
    await region('마지막 결과')

    await user.click(await runButton())
    await waitFor(() =>
      expect(toastText()).toContain(
        '강의 HP 대사를 끝까지 비교하지 못했어요. 실패 이유를 확인하세요. 다음 실행이 같은 범위를 다시 봐요.',
      ),
    )
    const summary = await region('마지막 결과')
    expect(within(summary).getByText('중단')).toHaveClass('pill', 'warn')
    expect(summary).toHaveTextContent('실패 이유: 지갑 조회 회로 열림')
  })

  it('어긋난 건이 있으면 건수를 안내한다', async () => {
    renderApp('/admin/hp-reconciliations', 'ADMIN')
    const user = userEvent.setup()
    await region('마지막 결과')

    await user.click(await runButton())
    await waitFor(() =>
      expect(toastText()).toContain(
        '강의 HP 대사를 마쳤어요. 어긋난 건 2건을 확인하세요.',
      ),
    )
  })

  it('이미 실행 중이면(409) 안내하고 마지막 결과를 다시 읽어 실행 중으로 보이며, 끝날 때까지 다시 읽는다', async () => {
    const user = useFakeClock()
    // 매일 배치가 화면을 연 뒤에 시작했다.
    hpReconciliationDb.onRun.lecture = () => {
      hpReconciliationDb.latest.lecture = running(lectureRun({ id: 13 }))
      return HttpResponse.json(
        {
          status: 409,
          code: 'HP_RECONCILIATION_RUNNING',
          detail: 'HP 대사가 이미 실행 중입니다.',
        },
        { status: 409 },
      )
    }
    renderApp('/admin/hp-reconciliations', 'ADMIN')
    await region('어긋난 건')

    await user.click(await runButton())
    await waitFor(() =>
      expect(toastText()).toContain(
        '강의 HP 대사가 이미 실행 중이에요. 끝나면 결과가 보여요.',
      ),
    )
    const summary = await region('마지막 결과')
    expect(await within(summary).findByText('실행 중')).toHaveClass(
      'pill',
      'info',
    )
    expect(screen.getByRole('button', { name: '지금 실행' })).toBeDisabled()
    expect(screen.queryByRole('region', { name: '어긋난 건' })).toBeNull()
    expect(summary).toHaveTextContent('끝—')

    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    const before = hpReconciliationDb.latestCalls.lecture
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    await waitFor(() =>
      expect(hpReconciliationDb.latestCalls.lecture).toBeGreaterThan(before),
    )

    hpReconciliationDb.latest.lecture = lectureRun({ id: 13 })
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    expect(await region('어긋난 건')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '지금 실행' })).toBeEnabled()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    const stopped = hpReconciliationDb.latestCalls.lecture
    await act(() => vi.advanceTimersByTimeAsync(20_000))
    expect(hpReconciliationDb.latestCalls.lecture).toBe(stopped)
  })

  it.each([
    ['네트워크 오류', () => HttpResponse.error()],
    [
      'Gateway 응답 시간 초과(504)',
      () => new HttpResponse('upstream request timeout', { status: 504 }),
    ],
  ])(
    '응답 전에 연결이 끊기면(%s) 실패로 끝내지 않고 안내한 뒤 마지막 결과를 다시 읽는다',
    async (_, drop) => {
      const user = useFakeClock()
      // 서버는 받은 실행을 계속한다.
      hpReconciliationDb.onRun.lecture = () => {
        hpReconciliationDb.latest.lecture = running(lectureRun({ id: 13 }))
        return drop()
      }
      renderApp('/admin/hp-reconciliations', 'ADMIN')
      await region('어긋난 건')
      const before = hpReconciliationDb.latestCalls.lecture

      await user.click(await runButton())
      await waitFor(() =>
        expect(toastText()).toContain(
          '응답을 받지 못했어요. 서버에서 계속 실행 중일 수 있어요. 마지막 결과로 확인하세요.',
        ),
      )
      expect(screen.queryByText('불러오지 못했어요')).toBeNull()
      const summary = await region('마지막 결과')
      expect(await within(summary).findByText('실행 중')).toBeInTheDocument()
      expect(hpReconciliationDb.latestCalls.lecture).toBeGreaterThan(before)

      hpReconciliationDb.latest.lecture = lectureRun({
        id: 13,
        triggerType: 'MANUAL',
        triggeredBy: 1,
      })
      await act(() => vi.advanceTimersByTimeAsync(5_000))
      expect(await within(summary).findByText('완료')).toBeInTheDocument()
      expect(summary).toHaveTextContent('계기관리자 실행 · 관리자 #1')
    },
  )

  it('실행 요청이 끝나지 않은 동안 버튼을 막고 마지막 결과를 다시 읽는다', async () => {
    const user = useFakeClock()
    hpReconciliationDb.latest.lecture = null
    let finish: (() => void) | undefined
    hpReconciliationDb.onRun.lecture = async () => {
      hpReconciliationDb.latest.lecture = running(lectureRun({ id: 1 }))
      await new Promise<void>((resolve) => (finish = resolve))
      const done = lectureRun({ id: 1, triggerType: 'MANUAL', triggeredBy: 1 })
      hpReconciliationDb.latest.lecture = done
      return HttpResponse.json({ statusCode: 200, message: '', data: done })
    }
    renderApp('/admin/hp-reconciliations', 'ADMIN')
    await screen.findByText('아직 실행한 적이 없어요')

    await user.click(await runButton())
    const busy = await screen.findByRole('button', { name: '실행 중…' })
    expect(busy).toBeDisabled()

    // 실행 요청이 끝나지 않은 동안 5초마다 다시 읽어 실행 중으로 바뀐다
    await act(() => vi.advanceTimersByTimeAsync(5_000))
    const summary = await region('마지막 결과')
    expect(await within(summary).findByText('실행 중')).toBeInTheDocument()

    await act(async () => finish?.())
    expect(await within(summary).findByText('완료')).toBeInTheDocument()
    expect(await runButton()).toBeEnabled()
  })
})
