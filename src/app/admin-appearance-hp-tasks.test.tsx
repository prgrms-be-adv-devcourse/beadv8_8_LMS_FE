import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import {
  appearanceHpTaskDb,
  appearanceHpTaskHandlers,
  resetAppearanceHpTaskDb,
} from '@/test/appearanceHpTaskMock'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

// 출연 HP 작업 API는 테스트 전용 목(src/test/appearanceHpTaskMock.ts)이 BE처럼 응답한다.
beforeEach(() => {
  resetAppearanceHpTaskDb()
  server.use(...appearanceHpTaskHandlers)
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

const list = () => screen.findByRole('list', { name: '출연 HP 작업 목록' })
const item = async (taskId: number) =>
  within(await list()).findByRole('listitem', {
    name: `출연 HP 작업 #${taskId}`,
  })
const retryButton = async (taskId: number) =>
  within(await item(taskId)).getByRole('button', { name: '다시 시도' })

describe('관리자 출연 HP 작업 목록', () => {
  it('운영 메뉴에서 들어가 멈춘 작업을 마지막으로 바뀐 순으로 보고 한 줄에 모든 정보를 보여 준다', async () => {
    renderApp('/admin/appearance-hp-tasks', 'ADMIN')

    // 메뉴 순서(강의 HP 작업 다음)는 router.test.tsx가 본다
    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(
      within(nav).getByRole('link', { name: '출연 HP 작업' }),
    ).toHaveAttribute('href', '/admin/appearance-hp-tasks')
    expect(
      await screen.findByRole('heading', { level: 1, name: '출연 HP 작업' }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: '작업 상태' })).getByRole(
        'button',
        { name: '멈춤' },
      ),
    ).toHaveAttribute('aria-pressed', 'true')

    const penalty = await item(41)
    expect(within(penalty).getByText('멈춤')).toHaveClass('pill', 'bad')
    expect(penalty).toHaveTextContent('#41 위약금 정산 · 호스트 취소')
    expect(penalty).toHaveTextContent(
      '요청서 #301 · 출연 #501 · 호스트 회원 #11 · 게스트 회원 #22',
    )
    expect(penalty).toHaveTextContent(
      '기준 출연료 50,000 HP · 위약금 15,000 HP(게스트에게)',
    )
    expect(penalty).toHaveTextContent('시도 1회 · 10/21(수) 09:00 멈춤')
    expect(penalty).toHaveTextContent(
      '마지막 오류: HOLD_ALREADY_CLOSED: 남은 보류가 없습니다.',
    )
    expect(penalty).toHaveTextContent('요청 ID appearance-penalty-501')
    expect(penalty).not.toHaveTextContent('관리자 다시 시도')
    expect(
      within(penalty).getByRole('button', { name: '다시 시도' }),
    ).toBeEnabled()

    const release = await item(42)
    expect(release).toHaveTextContent(
      '#42 반환 · 모집 마감(성립하지 못한 자리)',
    )
    expect(release).toHaveTextContent('모집글 #77 · 호스트 회원 #11')
    expect(release).not.toHaveTextContent('출연 #')
    expect(release).not.toHaveTextContent('게스트')
    expect(release).toHaveTextContent('20,000 HP')
    expect(release).toHaveTextContent(
      '관리자 다시 시도 1회 · 마지막 10/21(수) 12:10 · 관리자 #5',
    )

    // 마지막으로 바뀐 순(BE가 정해 정렬은 보내지 않는다)
    expect(
      within(await list())
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('aria-label')),
    ).toEqual(['출연 HP 작업 #42', '출연 HP 작업 #41'])
    expect(appearanceHpTaskDb.listCalls[0]).toBe('status=DEAD&page=0&size=20')
  })

  it('상태를 바꾸면 URL에 두고 그 상태의 첫 페이지를 요청한다. 멈춤이 아닌 작업에는 다시 시도가 없다', async () => {
    const router = renderApp('/admin/appearance-hp-tasks', 'ADMIN')
    const user = userEvent.setup()
    const group = await screen.findByRole('group', { name: '작업 상태' })

    await item(41)
    await user.click(within(group).getByRole('button', { name: '대기' }))
    expect(router.state.location.search).toBe('?status=PENDING')
    const pending = await item(43)
    expect(within(pending).getByText('대기')).toHaveClass('pill', 'warn')
    expect(pending).toHaveTextContent('#43 지급 · 출연 확인')
    // 지급은 받는 몫이 전체와 같아 한 번만 적는다
    expect(pending).toHaveTextContent('40,000 HP')
    expect(pending).not.toHaveTextContent('받는 몫')
    expect(pending).toHaveTextContent('시도 2회 · 10/22(목) 08:05 다음 시도')
    expect(within(pending).queryByRole('button')).toBeNull()

    await user.click(within(group).getByRole('button', { name: '완료' }))
    expect(router.state.location.search).toBe('?status=DONE')
    const done = await item(44)
    expect(within(done).getByText('완료')).toHaveClass('pill', 'ok')
    expect(done).toHaveTextContent('#44 반환 · 요청 만료')
    expect(done).toHaveTextContent('10/22(목) 09:00 완료')
    expect(within(done).queryByRole('button')).toBeNull()

    await user.click(within(group).getByRole('button', { name: '멈춤' }))
    expect(router.state.location.search).toBe('')
    await item(41)
    expect(appearanceHpTaskDb.listCalls).toEqual([
      'status=DEAD&page=0&size=20',
      'status=PENDING&page=0&size=20',
      'status=DONE&page=0&size=20',
      'status=DEAD&page=0&size=20',
    ])
  })

  it('모르는 상태 값이 URL에 있으면 멈춤으로 본다', async () => {
    renderApp('/admin/appearance-hp-tasks?status=ALL', 'ADMIN')
    await item(41)
    expect(appearanceHpTaskDb.listCalls[0]).toBe('status=DEAD&page=0&size=20')
  })

  it('페이지는 URL ?page=로 두고 그 페이지를 요청한다', async () => {
    const pages: string[] = []
    server.use(
      http.get('*/api/v1/appearances/admin/hp-tasks', ({ request }) => {
        const url = new URL(request.url)
        pages.push(
          `${url.searchParams.get('page')}/${url.searchParams.get('size')}`,
        )
        return rs({
          content: [appearanceHpTaskDb.items[0]],
          page: {
            size: 20,
            number: Number(url.searchParams.get('page')),
            totalElements: 41,
            totalPages: 3,
          },
        })
      }),
    )
    const router = renderApp('/admin/appearance-hp-tasks?page=2', 'ADMIN')
    await item(41)
    expect(pages[0]).toBe('1/20')
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    await waitFor(() => expect(router.state.location.search).toBe('?page=3'))
    await waitFor(() => expect(pages.at(-1)).toBe('2/20'))
  })

  it('멈춘 작업이 없으면 빈 상태를 보여 준다', async () => {
    resetAppearanceHpTaskDb([])
    renderApp('/admin/appearance-hp-tasks', 'ADMIN')
    expect(
      await screen.findByText('자동 처리가 멈춘 작업이 없어요'),
    ).toBeInTheDocument()
  })
})

describe('관리자 출연 HP 작업 다시 시도', () => {
  it('바로 처리되면(DONE) 처리됐다고 안내하고 멈춤 목록에서 빠진다', async () => {
    renderApp('/admin/appearance-hp-tasks', 'ADMIN')
    // 같은 멱등 키로 보내 HP가 두 번 움직이지 않으므로 확인 창 없이 보낸다
    await userEvent.click(await retryButton(41))
    expect(screen.queryByRole('dialog')).toBeNull()

    expect(
      await screen.findByText('HP 작업 #41: 처리됐어요.'),
    ).toBeInTheDocument()
    await waitFor(async () =>
      expect(
        within(await list()).queryByRole('listitem', {
          name: '출연 HP 작업 #41',
        }),
      ).toBeNull(),
    )
    expect(appearanceHpTaskDb.retryCalls).toEqual([41])

    await userEvent.click(
      within(screen.getByRole('group', { name: '작업 상태' })).getByRole(
        'button',
        { name: '완료' },
      ),
    )
    const done = await item(41)
    expect(done).toHaveTextContent(
      '관리자 다시 시도 1회 · 마지막 10/23(금) 09:00 · 관리자 #1',
    )
  })

  it('지갑이 다시 거절하면(DEAD) 마지막 오류와 함께 안내하고 목록에 다시 시도 기록이 남는다', async () => {
    appearanceHpTaskDb.retryResult = 'DEAD'
    appearanceHpTaskDb.retryError = 'WALLET_NOT_FOUND: 지갑을 찾을 수 없습니다.'
    renderApp('/admin/appearance-hp-tasks', 'ADMIN')
    await userEvent.click(await retryButton(41))

    expect(
      await screen.findByText(
        'HP 작업 #41: 지갑이 다시 거절했어요. WALLET_NOT_FOUND: 지갑을 찾을 수 없습니다.',
      ),
    ).toBeInTheDocument()
    await waitFor(async () =>
      expect(await item(41)).toHaveTextContent('관리자 다시 시도 1회'),
    )
    expect(await item(41)).toHaveTextContent(
      '마지막 오류: WALLET_NOT_FOUND: 지갑을 찾을 수 없습니다.',
    )
    expect(await retryButton(41)).toBeEnabled()
  })

  it('결과를 모르면(PENDING) 자동으로 이어서 확인한다고 안내하고 대기 목록으로 옮긴다', async () => {
    appearanceHpTaskDb.retryResult = 'PENDING'
    renderApp('/admin/appearance-hp-tasks', 'ADMIN')
    await userEvent.click(await retryButton(41))

    expect(
      await screen.findByText(
        'HP 작업 #41: 결과를 아직 몰라요. 자동으로 이어서 확인해요.',
      ),
    ).toBeInTheDocument()
    await waitFor(async () =>
      expect(
        within(await list()).queryByRole('listitem', {
          name: '출연 HP 작업 #41',
        }),
      ).toBeNull(),
    )
    expect(appearanceHpTaskDb.items.find((t) => t.id === 41)?.status).toBe(
      'PENDING',
    )
  })

  it('이미 다시 시도된 작업이면(409 HP_TASK_NOT_DEAD) 안내하고 목록을 다시 불러온다', async () => {
    renderApp('/admin/appearance-hp-tasks', 'ADMIN')
    const button = await retryButton(41)
    // 화면을 그린 뒤 다른 관리자가 먼저 다시 시도해 처리됐다.
    appearanceHpTaskDb.items.find((t) => t.id === 41)!.status = 'DONE'
    await userEvent.click(button)

    expect(
      await screen.findByText(
        '이미 다시 시도했거나 자동 처리가 멈춘 작업이 아니에요. 최신 목록을 불러왔어요.',
      ),
    ).toBeInTheDocument()
    await waitFor(async () =>
      expect(
        within(await list()).queryByRole('listitem', {
          name: '출연 HP 작업 #41',
        }),
      ).toBeNull(),
    )
  })

  it('다른 관리자와 동시에 다시 시도하면(409 CONCURRENT_UPDATE) 안내하고 목록을 다시 불러온다', async () => {
    server.use(
      http.post('*/api/v1/appearances/admin/hp-tasks/41/retry', () =>
        HttpResponse.json(
          {
            status: 409,
            code: 'CONCURRENT_UPDATE',
            detail: '다른 요청이 먼저 처리되었습니다.',
          },
          { status: 409 },
        ),
      ),
    )
    renderApp('/admin/appearance-hp-tasks', 'ADMIN')
    await item(41)
    const before = appearanceHpTaskDb.listCalls.length
    await userEvent.click(await retryButton(41))

    expect(
      await screen.findByText(
        '다른 관리자가 먼저 다시 시도했어요. 최신 목록을 불러왔어요.',
      ),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(appearanceHpTaskDb.listCalls.length).toBeGreaterThan(before),
    )
  })

  it('처리 중에는 같은 작업을 또 보내지 못한다', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    server.use(
      http.post('*/api/v1/appearances/admin/hp-tasks/41/retry', async () => {
        appearanceHpTaskDb.retryCalls.push(41)
        await gate
        const task = appearanceHpTaskDb.items.find((t) => t.id === 41)!
        task.status = 'DONE'
        return rs({ ...task })
      }),
    )
    renderApp('/admin/appearance-hp-tasks', 'ADMIN')
    await userEvent.click(await retryButton(41))
    const busy = await within(await item(41)).findByRole('button', {
      name: '다시 시도 중…',
    })
    expect(busy).toBeDisabled()
    // 다른 작업은 따로 다시 시도할 수 있다
    expect(await retryButton(42)).toBeEnabled()

    release()
    expect(
      await screen.findByText('HP 작업 #41: 처리됐어요.'),
    ).toBeInTheDocument()
    await settle()
    expect(appearanceHpTaskDb.retryCalls).toEqual([41])
  })
})
