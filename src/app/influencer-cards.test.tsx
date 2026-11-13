import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { chatKeys } from '@/entities/chat/api'
import type { ChatRoom } from '@/entities/chat/types'
import type { MemberProfile, MyChannel } from '@/entities/member/types'
import type { Viewer } from '@/shared/auth/role'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { noAppearanceRating, noRating } from '@/test/memberProfile'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'
import { expectSuccessToast } from '@/test/toast'

const WHALE_ID = 8

const influencer = (patch: Partial<MemberProfile> = {}): MemberProfile => ({
  id: WHALE_ID,
  nickname: '편집하는 고래',
  role: 'VERIFIED_INFLUENCER',
  profileImageUrl: null,
  appearanceRating: noRating,
  ...patch,
})

/** 목록: 다른 인플루언서(고래)와 내 카드(하늘) */
function mockList() {
  server.use(
    http.get('*/api/v1/members/influencers', () =>
      rs({
        content: [
          influencer(),
          influencer({ id: ME_ID, nickname: '하늘', role: 'INFLUENCER' }),
        ],
        page: { size: 12, number: 0, totalElements: 2, totalPages: 1 },
      }),
    ),
  )
}

const card = (name: string) => screen.findByRole('article', { name })

afterEach(() => {
  // 채팅방으로 옮긴 화면을 먼저 내려야 캐시를 비울 때 이력을 다시 불러 다음 테스트로 새지 않는다.
  cleanup()
  queryClient.clear()
  closeLoginModal()
})

describe('인플루언서 목록 카드', () => {
  it('머리글에 채팅 뒤 출연 요청 순서와 1인당 최저 출연료를 안내한다', async () => {
    mockList()
    renderApp('/influencers', 'INFLUENCER')

    expect(
      await screen.findByText(
        '채널 인증을 마친 인플루언서예요. 채팅으로 일정을 맞춘 뒤 출연 요청을 보내세요. 최저 출연료는 1인당 20,000 HP예요.',
      ),
    ).toBeInTheDocument()
  })

  it.each<Viewer>(['INFLUENCER', 'VERIFIED_INFLUENCER'])(
    '%s는 다른 인플루언서 카드에 프로필 · 채팅 · 출연 요청, 내 카드에 프로필 · 내 프로필을 본다',
    async (viewer) => {
      mockList()
      renderApp('/influencers', viewer)

      const other = await card('편집하는 고래')
      expect(
        [...other.querySelectorAll('a, button')].map((el) => el.textContent),
      ).toEqual(['편집하는 고래', '프로필', '채팅', '출연 요청'])
      expect(
        within(other).getByRole('button', {
          name: '편집하는 고래 님에게 출연 요청',
        }),
      ).toHaveClass('primary')
      expect(
        within(other).getByRole('button', { name: '편집하는 고래 님과 채팅' }),
      ).not.toHaveClass('primary')

      const mine = screen.getByRole('article', { name: '하늘' })
      expect(
        within(mine).getByRole('link', { name: '내 프로필' }),
      ).toHaveAttribute('href', '/profile/edit')
      expect(within(mine).queryByRole('button')).toBeNull()
    },
  )

  it('관리자는 프로필과 채팅만 본다', async () => {
    mockList()
    renderApp('/influencers', 'ADMIN')

    const other = await card('편집하는 고래')
    expect(
      within(other).getByRole('link', { name: '편집하는 고래 님 프로필' }),
    ).toBeInTheDocument()
    expect(
      within(other).getByRole('button', { name: '편집하는 고래 님과 채팅' }),
    ).toBeInTheDocument()
    expect(
      within(other).queryByRole('button', { name: /출연 요청/ }),
    ).toBeNull()
  })

  it('유저는 채널 인증 안내와 함께 프로필만 본다', async () => {
    mockList()
    renderApp('/influencers', 'USER')

    const other = await card('편집하는 고래')
    expect(
      within(other).getByRole('link', { name: '편집하는 고래 님 프로필' }),
    ).toBeInTheDocument()
    expect(within(other).queryByRole('button')).toBeNull()
    expect(screen.getByRole('link', { name: '채널 인증하기' })).toHaveAttribute(
      'href',
      '/verify',
    )
  })

  it('닉네임과 프로필 버튼은 그 인플루언서의 프로필로 간다', async () => {
    mockList()
    server.use(
      http.get(`*/api/v1/members/${WHALE_ID}`, () =>
        rs({
          ...influencer(),
          channels: [],
          appearanceRating: noAppearanceRating,
        }),
      ),
    )
    const router = renderApp('/influencers', 'INFLUENCER')

    const other = await card('편집하는 고래')
    expect(
      within(other).getByRole('link', { name: '편집하는 고래' }),
    ).toHaveAttribute('href', `/influencers/${WHALE_ID}`)
    await userEvent.click(
      within(other).getByRole('link', { name: '편집하는 고래 님 프로필' }),
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/influencers/${WHALE_ID}`),
    )
    expect(
      await screen.findByRole('heading', { name: '편집하는 고래' }),
    ).toBeInTheDocument()
  })

  it('카드에서 출연 요청을 보내면 그 인플루언서에게 보내고 보낸 요청 목록으로 간다', async () => {
    mockList()
    const myChannel: MyChannel = {
      id: 1,
      platform: 'CHZZK',
      channelName: '하늘 채널',
      channelUrl: 'https://chzzk.naver.com/sky',
      followerCount: 50,
      followerCountAt: null,
      status: 'APPROVED',
      rejectionReason: null,
      requestedAt: null,
    }
    let body: Record<string, unknown> | undefined
    server.use(
      http.get('*/api/v1/members/channels/me', () => rs([myChannel])),
      http.post('*/api/v1/appearances/requests', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return rs({ id: 30, guestId: WHALE_ID, status: 'REQUESTED' }, 201)
      }),
      http.get('*/api/v1/appearances/requests/sent', () =>
        rs({
          content: [],
          page: { size: 10, number: 0, totalElements: 0, totalPages: 0 },
        }),
      ),
    )
    const router = renderApp('/influencers', 'INFLUENCER')

    await userEvent.click(
      within(await card('편집하는 고래')).getByRole('button', {
        name: '편집하는 고래 님에게 출연 요청',
      }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: '출연 요청 보내기',
    })
    expect(router.state.location.pathname).toBe('/influencers')
    expect(within(dialog).getByText('편집하는 고래')).toBeInTheDocument()
    expect(
      await within(dialog).findByDisplayValue('https://chzzk.naver.com/sky'),
    ).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText('제목'), '주말 합방')
    await userEvent.type(
      within(dialog).getByLabelText('요청 내용'),
      '공포 게임 2인',
    )
    await userEvent.click(
      await within(dialog).findByRole('button', {
        name: '20,000 HP 보류하고 요청',
      }),
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/appearances'),
    )
    expect(router.state.location.search).toBe('?tab=host')
    await expectSuccessToast('편집하는 고래 님에게 출연 요청을 보냈어요.')
    expect(body).toMatchObject({
      guestId: WHALE_ID,
      title: '주말 합방',
      fee: 20000,
    })
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('카드에서 채팅을 시작하면 그 인플루언서와의 채팅방으로 간다', async () => {
    mockList()
    const room: ChatRoom = {
      chatRoomId: 5,
      roomType: 'DIRECT',
      status: 'ACTIVE',
      createdAt: '2026-10-14T10:00:00',
      members: [
        {
          userId: ME_ID,
          nickname: '하늘',
          active: true,
          participationVersion: 1,
        },
        {
          userId: WHALE_ID,
          nickname: '편집하는 고래',
          active: true,
          participationVersion: 1,
        },
      ],
    }
    let target: unknown
    server.use(
      http.post('*/api/v1/chats', async ({ request }) => {
        target = await request.json()
        return rs(room, 201)
      }),
      http.get('*/api/v1/chats', () => rs([room])),
      http.get('*/api/v1/chats/:roomId/messages', () =>
        rs({ messages: [], nextCursor: null }),
      ),
      http.put(
        '*/api/v1/chats/:roomId/read',
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    const router = renderApp('/influencers', 'VERIFIED_INFLUENCER')

    await userEvent.click(
      within(await card('편집하는 고래')).getByRole('button', {
        name: '편집하는 고래 님과 채팅',
      }),
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/chat/5'))
    expect(target).toEqual({ targetUserId: WHALE_ID })
    expect(
      await screen.findByRole('region', { name: '편집하는 고래 님과의 대화' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(queryClient.getQueryState(chatKeys.messages(5))?.status).toBe(
        'success',
      ),
    )
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })
})
