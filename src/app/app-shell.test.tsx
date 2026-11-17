import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from '@/app/fallbacks/chunkLoad'
import { queryClient } from '@/app/queryClient'
import { createRoutes, PAGE_LOADERS } from '@/app/router'
import { renderApp } from '@/test/renderApp'

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
  queryClient.clear()
})

function Broken(): never {
  throw new Error('화면을 그리다 실패')
}

/** 헤더(로고)와 주 메뉴가 남아 있다 */
async function expectShell() {
  expect(
    await screen.findByRole('link', { name: '합방 홈' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('navigation', { name: '주 메뉴' }),
  ).toBeInTheDocument()
}

describe('화면 오류(앱 셸 안)', () => {
  it('화면 하나가 그리다 실패해도 헤더·메뉴는 남고, 메뉴로 다른 화면에 갈 수 있다', async () => {
    // 라우터가 잡은 렌더 오류를 콘솔에 남기는 것은 이 테스트에서 의도한 것이다.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = renderApp(
      '/wallet',
      'USER',
      {},
      { routes: createRoutes({ '/wallet': Broken }) },
    )
    expect(await screen.findByText('문제가 생겼어요')).toBeInTheDocument()
    await expectShell()

    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    await userEvent.click(within(nav).getByRole('link', { name: '쿠폰함' }))
    expect(
      await screen.findByRole('heading', { name: '쿠폰함' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/library/coupons')
    expect(screen.queryByText('문제가 생겼어요')).not.toBeInTheDocument()
  })

  it('방금 새로고침했는데 또 화면 파일을 못 받으면 앱 셸 안에서 새로고침을 안내한다', async () => {
    sessionStorage.setItem('hapbang:chunk-reloaded-at', String(Date.now()))
    vi.spyOn(PAGE_LOADERS, '/wallet').mockRejectedValue(
      new TypeError(
        'Failed to fetch dynamically imported module: https://hapbang.test/assets/WalletPage-old.js',
      ),
    )
    const reload = vi.spyOn(page, 'reload').mockImplementation(() => {})
    renderApp('/wallet', 'USER', {}, { routes: createRoutes() })
    expect(
      await screen.findByText('화면을 불러오지 못했어요'),
    ).toBeInTheDocument()
    await expectShell()
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('브라우저 탭 제목', () => {
  it('가장 안쪽 화면의 제목을 "<제목> · 합방"으로 쓰고, 화면을 옮기면 바꾼다', async () => {
    const router = renderApp('/wallet', 'USER')
    await screen.findByRole('heading', { name: '지갑' })
    expect(document.title).toBe('지갑 · 합방')

    await router.navigate('/library/coupons')
    await waitFor(() => expect(document.title).toBe('쿠폰함 · 합방'))
  })

  it('제목이 없는 화면(없는 주소)은 "합방"이다', async () => {
    renderApp('/no-such-page', 'USER')
    expect(
      await screen.findByText('페이지를 찾을 수 없어요'),
    ).toBeInTheDocument()
    expect(document.title).toBe('합방')
  })
})
