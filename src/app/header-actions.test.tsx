import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { CartItem } from '@/entities/cart/types'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const item = (id: number): CartItem => ({
  lectureId: id,
  title: `강의 ${id}`,
  priceHp: 1000,
  thumbnailUrl: null,
  purchasable: true,
})

/** 담은 강의 count개. 빼기(DELETE)를 하면 이후 조회에 반영한다. */
function mockCart(count: number) {
  let items = Array.from({ length: count }, (_, i) => item(i + 1))
  server.use(
    http.get('*/api/v1/lectures/cart', () =>
      rs({ items, purchasableTotalHp: items.length * 1000 }),
    ),
    http.delete('*/api/v1/lectures/cart/items/:lectureId', ({ params }) => {
      items = items.filter((i) => i.lectureId !== Number(params.lectureId))
      return new HttpResponse(null, { status: 204 })
    }),
  )
}

const header = () => screen.findByRole('banner')

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('상단 헤더 장바구니', () => {
  it('상단 바에 회원 장바구니 링크와 개수 배지가 있다', async () => {
    mockCart(3)
    renderApp('/lectures', 'USER')
    const link = await within(await header()).findByRole('link', {
      name: '장바구니 3개',
    })
    expect(link).toHaveAttribute('href', '/cart')
    expect(link).toHaveTextContent('3')
  })

  it('홈 헤더에도 같은 장바구니 링크가 있다', async () => {
    mockCart(3)
    renderApp('/', 'INFLUENCER')
    expect(
      await within(await header()).findByRole('link', { name: '장바구니 3개' }),
    ).toHaveAttribute('href', '/cart')
  })

  it('비어 있으면 배지를 숨긴다', async () => {
    mockCart(0)
    renderApp('/lectures', 'USER')
    const bar = await header()
    // 조회가 끝난 뒤에도 개수 없이 '장바구니'다.
    await waitFor(() =>
      expect(queryClient.getQueryState(['cart'])?.status).toBe('success'),
    )
    const link = within(bar).getByRole('link', { name: '장바구니' })
    expect(link).toHaveTextContent(/^$/)
  })

  it('99개를 넘으면 배지는 99+로, 이름에는 실제 개수를 넣는다', async () => {
    mockCart(100)
    renderApp('/lectures', 'USER')
    const link = await within(await header()).findByRole('link', {
      name: '장바구니 100개',
    })
    expect(link).toHaveTextContent('99+')
  })

  it('장바구니를 불러오지 못하면 아이콘만 보인다', async () => {
    server.use(
      http.get('*/api/v1/lectures/cart', () =>
        HttpResponse.json(
          { status: 400, code: 'X', detail: '오류' },
          { status: 400 },
        ),
      ),
    )
    renderApp('/lectures', 'USER')
    const bar = await header()
    await waitFor(() =>
      expect(queryClient.getQueryState(['cart'])?.status).toBe('error'),
    )
    const link = within(bar).getByRole('link', { name: '장바구니' })
    expect(link).toHaveTextContent(/^$/)
  })

  it('장바구니에서 빼면 헤더 배지가 줄어든다', async () => {
    mockCart(2)
    renderApp('/cart', 'USER')
    const bar = await header()
    await within(bar).findByRole('link', { name: '장바구니 2개' })
    document.cookie = 'XSRF-TOKEN=t'
    await userEvent.click(
      await screen.findByRole('button', { name: '강의 1 장바구니에서 빼기' }),
    )
    expect(
      await within(bar).findByRole('link', { name: '장바구니 1개' }),
    ).toBeInTheDocument()
  })
})

describe('상단 헤더 알림·권한', () => {
  it('두 헤더 모두 회원에게 알림 링크가 있다', async () => {
    mockCart(0)
    renderApp('/lectures', 'USER')
    expect(
      await within(await header()).findByRole('link', { name: '알림' }),
    ).toHaveAttribute('href', '/alerts')
  })

  it('홈 헤더에도 알림 링크가 있다', async () => {
    mockCart(0)
    renderApp('/', 'USER')
    expect(
      await within(await header()).findByRole('link', { name: '알림' }),
    ).toHaveAttribute('href', '/alerts')
  })

  it.each([
    ['비회원', '/lectures', 'GUEST'],
    ['비회원 홈', '/', 'GUEST'],
    ['관리자', '/admin', 'ADMIN'],
    ['관리자 홈', '/', 'ADMIN'],
  ] as const)('%s에게는 알림·장바구니가 없다', async (_, path, viewer) => {
    renderApp(path, viewer)
    const bar = await header()
    await within(bar).findByRole('link', { name: '합방 홈' })
    expect(within(bar).queryByRole('link', { name: /장바구니/ })).toBeNull()
    expect(within(bar).queryByRole('link', { name: '알림' })).toBeNull()
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(within(nav).queryByRole('link', { name: /장바구니/ })).toBeNull()
    expect(within(nav).queryByRole('link', { name: '알림' })).toBeNull()
  })
})

describe('좁은 화면 드로어', () => {
  it('헤더 대신 드로어 내 활동 맨 위에 알림·장바구니가 있다', async () => {
    mockCart(3)
    renderApp('/lectures', 'USER')
    await userEvent.click(
      await screen.findByRole('button', { name: '메뉴 열기' }),
    )
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    const group = within(nav).getByRole('group', { name: '내 활동' })
    const cart = await within(group).findByRole('link', {
      name: '장바구니 3개',
    })
    const alerts = within(group).getByRole('link', { name: '알림' })
    // 넓은 화면에서는 헤더에 있으므로 좁은 화면에서만 보인다(CSS).
    expect(cart.closest('[data-narrow-only]')).not.toBeNull()
    expect(alerts.closest('[data-narrow-only]')).not.toBeNull()
    expect(
      within(group)
        .getAllByRole('link')
        .slice(0, 2)
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/alerts', '/cart'])
  })
})

describe('아바타 메뉴', () => {
  it('상단 바도 아바타 메뉴로 로그아웃하고, 헤더에 로그아웃 버튼이 드러나 있지 않다', async () => {
    mockCart(0)
    renderApp('/lectures', 'USER')
    const bar = await header()
    const avatar = await within(bar).findByRole('button', { name: '하늘 메뉴' })
    expect(within(bar).queryByRole('button', { name: '로그아웃' })).toBeNull()
    await userEvent.click(avatar)
    expect(
      within(bar).getByRole('button', { name: '로그아웃' }),
    ).toBeInTheDocument()
  })
})
