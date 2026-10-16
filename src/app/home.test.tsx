import { screen, within } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { LectureSummary } from '@/entities/lecture/types'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'
import userEvent from '@testing-library/user-event'

const lecture = (id: number, title: string): LectureSummary => ({
  lectureId: id,
  title,
  priceHp: 9000 + id,
  thumbnailUrl: null,
  sellerUserId: 90,
  sellerNickname: '하루',
  averageRating: null,
  reviewCount: 0,
})

function mockLectures(count: number) {
  server.use(
    http.get('*/api/v1/lectures', () =>
      rs({
        content: Array.from({ length: count }, (_, i) =>
          lecture(i + 1, `강의 ${i + 1}`),
        ),
        page: { size: 12, number: 0, totalElements: count, totalPages: 1 },
      }),
    ),
  )
}

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('홈', () => {
  it('비회원에게 소개, Google로 시작하기, 최근 강의 4개, 시작 띠를 보여 준다', async () => {
    mockLectures(6)
    renderApp('/', 'GUEST')

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /합방 상대를 찾고/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: /Google로 시작하기/ }).length,
    ).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('구글 계정으로 바로 시작해요')).toBeInTheDocument()

    // 실제 강의 목록 API에서 최근 4개만
    expect(
      await screen.findByRole('button', { name: /강의 4/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /강의 5/ })).toBeNull()
    // 비회원이 강의를 누르면 로그인 모달
    await userEvent.click(screen.getByRole('button', { name: /강의 1/ }))
    expect(
      await screen.findByRole('dialog', { name: '합방 시작하기' }),
    ).toBeInTheDocument()
  })

  it('유저에게는 채널 인증하기와 지금 내 등급을 보여 준다', async () => {
    mockLectures(0)
    renderApp('/', 'USER')

    expect(
      await screen.findAllByRole('link', { name: '채널 인증하기' }),
    ).toHaveLength(2)
    const here = document.querySelector('[aria-current="step"]') as HTMLElement
    expect(within(here).getByText('유저')).toBeInTheDocument()
    expect(within(here).getByText('지금 여기')).toBeInTheDocument()
    expect(screen.queryByText('구글 계정으로 바로 시작해요')).toBeNull()
    expect(
      await screen.findByText('아직 판매 중인 강의가 없어요.'),
    ).toBeInTheDocument()
  })

  it('인플루언서에게는 게스트 찾기·모집 글 올리기·승급 신청을 보여 준다', async () => {
    mockLectures(0)
    renderApp('/', 'INFLUENCER')

    expect(
      await screen.findByRole('link', { name: '게스트 찾기' }),
    ).toHaveAttribute('href', '/influencers')
    expect(
      screen.getByRole('link', { name: '모집 글 올리기' }),
    ).toHaveAttribute('href', '/recruits')
    expect(screen.getByRole('link', { name: '승급 신청하기' })).toHaveAttribute(
      'href',
      '/promote',
    )
  })

  it('인증된 인플루언서는 다음 등급 버튼이 없다', async () => {
    mockLectures(0)
    renderApp('/', 'VERIFIED_INFLUENCER')
    await screen.findByRole('link', { name: '게스트 찾기' })
    expect(screen.queryByRole('link', { name: '승급 신청하기' })).toBeNull()
    const here = document.querySelector('[aria-current="step"]') as HTMLElement
    expect(within(here).getByText('인증된 인플루언서')).toBeInTheDocument()
  })

  it('홈은 맨 위 가로 메뉴를 쓰고, 둘러보기 메뉴는 햄버거로 연다', async () => {
    mockLectures(0)
    renderApp('/', 'VERIFIED_INFLUENCER')

    const top = await screen.findByRole('navigation', { name: '둘러보기' })
    expect(
      within(top)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['홈', '인플루언서', '출연 모집', '강의', '강의 판매'])
    expect(within(top).getByRole('link', { name: '홈' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    const menu = screen.getByRole('button', { name: '메뉴 열기' })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(menu)
    expect(screen.getByRole('button', { name: '메뉴 닫기' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    const drawer = screen.getByRole('navigation', { name: '주 메뉴' })
    // 홈은 로고로 간다. 장바구니는 상단 헤더에 있고, 드로어에는 좁은 화면에서만 보인다.
    expect(within(drawer).queryByRole('link', { name: '홈' })).toBeNull()
    expect(
      within(drawer)
        .getByRole('link', { name: '장바구니' })
        .closest('[data-narrow-only]'),
    ).not.toBeNull()
  })

  it('홈 헤더 검색은 검색 화면으로 보낸다', async () => {
    mockLectures(0)
    const router = renderApp('/', 'GUEST')
    await userEvent.type(
      await screen.findByRole('textbox', { name: '검색' }),
      '썸네일{Enter}',
    )
    expect(router.state.location.pathname).toBe('/search')
    expect(router.state.location.search).toBe('?q=%EC%8D%B8%EB%84%A4%EC%9D%BC')
  })

  it('홈이 아닌 화면은 기존 상단 바를 쓴다', async () => {
    mockLectures(0)
    renderApp('/lectures', 'GUEST')
    await screen.findByRole('heading', { name: '강의' })
    expect(screen.queryByRole('navigation', { name: '둘러보기' })).toBeNull()
  })

  it('프로필 메뉴에서 로그아웃할 수 있다', async () => {
    mockLectures(0)
    renderApp('/', 'USER')
    const avatar = await screen.findByRole('button', { name: '하늘 메뉴' })
    await userEvent.click(avatar)
    // 왼쪽 내비(드로어)에도 계정 설정이 있으므로 프로필 메뉴 안에서 찾는다.
    const menu = avatar.parentElement as HTMLElement
    expect(
      within(menu).getByRole('button', { name: '로그아웃' }),
    ).toBeInTheDocument()
    expect(
      within(menu).getByRole('link', { name: '계정 설정' }),
    ).toHaveAttribute('href', '/settings')
  })

  it('프로필 메뉴는 Esc와 바깥 클릭으로 닫힌다', async () => {
    mockLectures(0)
    renderApp('/', 'USER')
    const avatar = await screen.findByRole('button', { name: '하늘 메뉴' })

    await userEvent.click(avatar)
    expect(avatar).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard('{Escape}')
    expect(avatar).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(avatar)
    expect(avatar).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(
      screen.getByRole('heading', { level: 1, name: /합방 상대를 찾고/ }),
    )
    expect(avatar).toHaveAttribute('aria-expanded', 'false')
  })

  it('푸터 고객센터는 회원만 링크, 관리자는 문의 답변, 비회원은 글자만', async () => {
    mockLectures(0)
    renderApp('/', 'GUEST')
    const guestFooter = await screen.findByRole('contentinfo')
    expect(within(guestFooter).getByText('고객센터').tagName).toBe('SPAN')
    expect(
      within(guestFooter).queryByRole('link', { name: '고객센터' }),
    ).toBeNull()
  })

  it('관리자 푸터는 문의 답변으로 연결한다', async () => {
    mockLectures(0)
    renderApp('/', 'ADMIN')
    const footer = await screen.findByRole('contentinfo')
    expect(
      within(footer).getByRole('link', { name: '문의 답변' }),
    ).toHaveAttribute('href', '/admin/inquiries')
  })

  it('회원 푸터는 고객센터로 연결한다', async () => {
    mockLectures(0)
    renderApp('/', 'USER')
    const footer = await screen.findByRole('contentinfo')
    expect(
      within(footer).getByRole('link', { name: '고객센터' }),
    ).toHaveAttribute('href', '/support')
  })
})
