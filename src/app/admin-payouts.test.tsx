import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { payoutFailuresQuery } from '@/entities/payout/api'
import {
  payoutFailureDb,
  payoutFailureHandlers,
  resetPayoutFailureDb,
} from '@/test/payoutFailureMock'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

// 지급 실패 API는 테스트 전용 목(src/test/payoutFailureMock.ts)이 BE처럼 응답한다.
beforeEach(() => {
  resetPayoutFailureDb()
  server.use(...payoutFailureHandlers)
  document.cookie = 'XSRF-TOKEN=t'
})

afterEach(() => queryClient.clear())

const item = (orderItemId: number) =>
  screen.findByRole('listitem', {
    name: `주문 항목 ${orderItemId}의 지급 실패`,
  })

/** 처리 뒤 목록을 다시 불러온 것까지 끝나야 다음 테스트로 요청이 새지 않는다(#84·#86) */
async function settle(page = 0) {
  await waitFor(() =>
    expect(
      queryClient.getQueryState(payoutFailuresQuery(page).queryKey)?.status,
    ).toBe('success'),
  )
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))
}

describe('관리자 지급 실패', () => {
  it('운영 메뉴에서 들어가 격리·자동 재시도 대기를 배지로 구분하고 실패 코드를 설명한다', async () => {
    renderApp('/admin/payouts', 'ADMIN')

    const nav = await screen.findByRole('navigation', { name: '주 메뉴' })
    expect(
      within(nav).getByRole('link', { name: '지급 실패' }),
    ).toHaveAttribute('href', '/admin/payouts')

    const quarantined = await item(701)
    expect(within(quarantined).getByText('격리됨')).toBeInTheDocument()
    expect(
      within(quarantined).getByText(/주문 #600 · 항목 #701/),
    ).toBeInTheDocument()
    expect(
      within(quarantined).getByRole('link', { name: '강의 #7' }),
    ).toHaveAttribute('href', '/admin/lectures/7')
    expect(
      within(quarantined).getByText(
        /판매자 회원 #21 · 구매자 회원 #31 · 15,000 HP/,
      ),
    ).toBeInTheDocument()
    expect(
      within(quarantined).getByText(
        /실패 1회 .* 지급액이 주문 금액과 맞지 않아요/,
      ),
    ).toBeInTheDocument()
    expect(
      within(quarantined).getByText(/격리 — 지급 배치가 처리하지 않아요/),
    ).toBeInTheDocument()
    expect(
      within(quarantined).getByRole('button', { name: '격리 해제' }),
    ).toBeInTheDocument()

    const wallet = await item(702)
    expect(within(wallet).getByText('자동 재시도 대기')).toBeInTheDocument()
    expect(
      within(wallet).getByText(/판매자 지갑이 없어요\(일시\)/),
    ).toBeInTheDocument()
    expect(within(wallet).queryByRole('button')).toBeNull()

    const transient = await item(703)
    expect(
      within(transient).getByText(
        /일시 오류 \(ObjectOptimisticLockingFailureException\)/,
      ),
    ).toBeInTheDocument()
    // 최근 실패순
    const list = screen.getByRole('list', { name: '지급 실패 목록' })
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('aria-label')),
    ).toEqual([
      '주문 항목 701의 지급 실패',
      '주문 항목 702의 지급 실패',
      '주문 항목 703의 지급 실패',
    ])
    await settle()
  })

  it('격리를 해제하면 안내 후 목록을 다시 불러와 자동 재시도 대기로 바뀐다', async () => {
    renderApp('/admin/payouts', 'ADMIN')
    const row = await item(701)
    await userEvent.click(
      within(row).getByRole('button', { name: '격리 해제' }),
    )

    const dialog = screen.getByRole('dialog', { name: '격리를 해제할까요?' })
    expect(
      within(dialog).getByText(/원인을 먼저 고친 뒤 해제하세요/),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/다음 지급 배치\(매일 01:00\)/),
    ).toBeInTheDocument()
    await userEvent.click(
      within(dialog).getByRole('button', { name: '격리 해제' }),
    )

    expect(
      await screen.findByText(
        '격리를 해제했어요. 다음 지급 배치(매일 01:00)에서 다시 시도해요.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      await within(await item(701)).findByText('자동 재시도 대기'),
    ).toBeInTheDocument()
    expect(payoutFailureDb.items[0].payoutQuarantinedAt).toBeNull()
    await settle()
  })

  it('이미 해제됐으면(409) 안내하고 목록을 다시 불러온다', async () => {
    let listCalls = 0
    server.use(
      http.get('*/api/v1/lectures/admin/payout-failures', () => {
        listCalls++
        return rs({
          content: [payoutFailureDb.items[0]],
          page: { size: 20, number: 0, totalElements: 1, totalPages: 1 },
        })
      }),
      http.post('*/api/v1/lectures/admin/payout-failures/701/retry', () =>
        HttpResponse.json(
          {
            status: 409,
            code: 'PAYOUT_NOT_QUARANTINED',
            detail: '지급이 격리된 항목이 아닙니다.',
          },
          { status: 409 },
        ),
      ),
    )
    renderApp('/admin/payouts', 'ADMIN')
    const row = await item(701)
    const before = listCalls
    await userEvent.click(
      within(row).getByRole('button', { name: '격리 해제' }),
    )
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '격리 해제',
      }),
    )
    expect(
      await screen.findByText(
        '이미 해제됐거나 격리되지 않은 항목이에요. 목록을 새로 불러왔어요.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(listCalls).toBeGreaterThan(before))
    await settle()
  })

  it('없는 항목이면(404) 안내한다', async () => {
    server.use(
      http.post('*/api/v1/lectures/admin/payout-failures/701/retry', () =>
        HttpResponse.json(
          {
            status: 404,
            code: 'ORDER_ITEM_NOT_FOUND',
            detail: '주문 항목을 찾을 수 없습니다.',
          },
          { status: 404 },
        ),
      ),
    )
    renderApp('/admin/payouts', 'ADMIN')
    const row = await item(701)
    await userEvent.click(
      within(row).getByRole('button', { name: '격리 해제' }),
    )
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '격리 해제',
      }),
    )
    expect(
      await screen.findByText(
        '주문 항목을 찾을 수 없어요. 목록을 새로 불러왔어요.',
      ),
    ).toBeInTheDocument()
    await settle()
  })

  it('처리 중에는 모달을 닫고 다시 열어도 또 보내지 못한다', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let calls = 0
    server.use(
      http.post(
        '*/api/v1/lectures/admin/payout-failures/701/retry',
        async () => {
          calls++
          await gate
          payoutFailureDb.items[0].payoutQuarantinedAt = null
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )
    renderApp('/admin/payouts', 'ADMIN')
    const row = await item(701)
    await userEvent.click(
      within(row).getByRole('button', { name: '격리 해제' }),
    )
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '격리 해제',
      }),
    )
    await waitFor(() => expect(calls).toBe(1))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      within(row).getByRole('button', { name: '격리 해제' }),
    ).toBeDisabled()

    release()
    expect(
      await screen.findByText(
        '격리를 해제했어요. 다음 지급 배치(매일 01:00)에서 다시 시도해요.',
      ),
    ).toBeInTheDocument()
    expect(calls).toBe(1)
    await settle()
  })

  it('처리 중에 다른 메뉴로 갔다 돌아와도 같은 항목을 또 보내지 못한다', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let calls = 0
    server.use(
      http.post(
        '*/api/v1/lectures/admin/payout-failures/701/retry',
        async () => {
          calls++
          await gate
          payoutFailureDb.items[0].payoutQuarantinedAt = null
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )
    const router = renderApp('/admin/payouts', 'ADMIN')
    const row = await item(701)
    await userEvent.click(
      within(row).getByRole('button', { name: '격리 해제' }),
    )
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '격리 해제',
      }),
    )
    await waitFor(() => expect(calls).toBe(1))

    // 응답 전에 다른 화면으로 갔다가 돌아온다(화면이 새로 만들어진다).
    await router.navigate('/admin/channels')
    // 이동은 비동기라 다른 화면이 실제로 그려진 것(지급 실패 화면이 내려간 것)을 확인한다.
    await screen.findByRole('heading', { name: '채널 인증 심사' })
    expect(screen.queryByRole('heading', { name: '지급 실패' })).toBeNull()
    await router.navigate('/admin/payouts')
    const again = await item(701)
    expect(
      within(again).getByRole('button', { name: '격리 해제' }),
    ).toBeDisabled()

    release()
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(calls).toBe(1)
    await settle()
  })

  it('페이지는 URL ?page=로 두고 그 페이지를 요청한다', async () => {
    const pages: string[] = []
    server.use(
      http.get('*/api/v1/lectures/admin/payout-failures', ({ request }) => {
        const url = new URL(request.url)
        pages.push(
          `${url.searchParams.get('page')}/${url.searchParams.get('size')}`,
        )
        return rs({
          content: [payoutFailureDb.items[0]],
          page: {
            size: 20,
            number: Number(url.searchParams.get('page')),
            totalElements: 41,
            totalPages: 3,
          },
        })
      }),
    )
    const router = renderApp('/admin/payouts?page=2', 'ADMIN')
    await item(701)
    expect(pages[0]).toBe('1/20')
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    await waitFor(() => expect(router.state.location.search).toBe('?page=3'))
    await waitFor(() => expect(pages.at(-1)).toBe('2/20'))
    await settle(2)
  })

  it('관리자가 아니면 열 수 없다', async () => {
    renderApp('/admin/payouts', 'VERIFIED_INFLUENCER')
    expect(await screen.findByText(/권한|볼 수 없/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '지급 실패' })).toBeNull()
  })
})
