import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { MyChannel } from '@/entities/member/types'
import type { Me } from '@/shared/auth/me'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

const me = (patch: Partial<Me> = {}): Me => ({
  id: ME_ID,
  email: 'a@b.c',
  nickname: '하늘',
  role: 'USER',
  status: 'ACTIVE',
  profileImageUrl: null,
  ...patch,
})

const channel = (patch: Partial<MyChannel> = {}): MyChannel => ({
  id: 3,
  platform: 'CHZZK',
  channelName: '새벽기타',
  channelUrl: 'https://chzzk.naver.com/abc',
  followerCount: 7,
  followerCountAt: '2026-10-14T10:00:00',
  status: 'REGISTERED',
  rejectionReason: null,
  requestedAt: null,
  ...patch,
})

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('인플루언서', () => {
  it('목록에서 프로필로 가면 채널과 팔로워 합계를 보여 준다', async () => {
    server.use(
      http.get('*/api/v1/members/influencers', () =>
        rs({
          content: [
            {
              id: 8,
              nickname: '편집하는 고래',
              role: 'VERIFIED_INFLUENCER',
              profileImageUrl: null,
            },
          ],
          page: { size: 12, number: 0, totalElements: 1, totalPages: 1 },
        }),
      ),
      http.get('*/api/v1/members/8', () =>
        rs({
          id: 8,
          nickname: '편집하는 고래',
          role: 'VERIFIED_INFLUENCER',
          profileImageUrl: null,
          channels: [
            {
              platform: 'CHZZK',
              channelName: '고래 편집실',
              channelUrl: 'https://chzzk.naver.com/w',
              followerCount: 1200,
              followerCountAt: null,
            },
            {
              platform: 'CHZZK',
              channelName: '고래 2채널',
              channelUrl: 'https://chzzk.naver.com/w2',
              followerCount: 300,
              followerCountAt: null,
            },
          ],
        }),
      ),
    )
    renderApp('/influencers', 'INFLUENCER')
    await userEvent.click(
      await screen.findByRole('link', { name: /편집하는 고래/ }),
    )

    expect(
      await screen.findByRole('heading', { name: '편집하는 고래' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '고래 편집실' })).toHaveAttribute(
      'href',
      'https://chzzk.naver.com/w',
    )
    expect(screen.getByText('1,500')).toBeInTheDocument()
  })

  it('목록 URL의 페이지가 마지막 페이지를 넘으면 마지막 페이지로 옮긴다', async () => {
    // Spring Page는 범위를 넘는 페이지에 빈 content와 실제 totalPages를 준다.
    server.use(
      http.get('*/api/v1/members/influencers', ({ request }) => {
        const p = Number(new URL(request.url).searchParams.get('page'))
        return rs({
          content:
            p < 2
              ? [
                  {
                    id: 8 + p,
                    nickname: `둘째 페이지 고래 ${p + 1}`,
                    role: 'VERIFIED_INFLUENCER',
                    profileImageUrl: null,
                  },
                ]
              : [],
          page: { size: 12, number: p, totalElements: 13, totalPages: 2 },
        })
      }),
    )
    const router = renderApp('/influencers?page=9', 'INFLUENCER')

    expect(
      await screen.findByRole('link', { name: /둘째 페이지 고래 2/ }),
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe('?page=2')
    expect(
      screen.queryByText('아직 인증된 인플루언서가 없어요'),
    ).not.toBeInTheDocument()
  })
})

describe('채널 인증', () => {
  it('승인 요청이 자동 승인되면 그 자리에서 인플루언서로 바뀐다', async () => {
    let role: Me['role'] = 'USER'
    server.use(
      http.get('*/api/v1/members/channels/me', () => rs([channel()])),
      http.post('*/api/v1/members/channels/3/approval-request', () => {
        role = 'INFLUENCER'
        return rs({ status: 'APPROVED', role })
      }),
      http.get('*/api/v1/members/me', () => rs(me({ role }))),
    )
    document.cookie = 'XSRF-TOKEN=t'
    const router = renderApp('/verify', 'USER')

    await userEvent.click(
      await screen.findByRole('button', { name: '승인 요청' }),
    )
    // 안내는 2.6초 뒤 사라지므로, 역할을 다시 불러오기 전에 먼저 확인한다.
    expect(
      await screen.findByText('채널이 승인됐어요. 이제 인플루언서예요.'),
    ).toBeInTheDocument()
    // 역할이 바뀌어도 권한 없음으로 내보내지 않고, 같은 화면에서 완료 안내를 보여 준다.
    expect(await screen.findByText('인증 완료')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/verify')
    expect(screen.queryByText('이 화면을 볼 권한이 없어요.')).toBeNull()
    expect(
      screen.queryByRole('link', { name: '치지직 채널 연동하기' }),
    ).toBeNull()
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(
      within(nav).getByRole('link', { name: '내 출연' }),
    ).toBeInTheDocument()
  })

  it('반려된 채널은 사유와 다시 승인 요청 버튼을 보여 준다', async () => {
    server.use(
      http.get('*/api/v1/members/channels/me', () =>
        rs([
          channel({
            status: 'REJECTED',
            rejectionReason: '방송 기록이 없어요',
          }),
        ]),
      ),
    )
    renderApp('/verify', 'USER')
    expect(
      await screen.findByText('반려 사유: 방송 기록이 없어요'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '다시 승인 요청' }),
    ).toBeInTheDocument()
  })

  it('치지직 연동 실패로 돌아오면 채널 인증 화면에 이유를 보여 준다', async () => {
    server.use(
      http.get('*/api/v1/members/channels/me', () => rs([])),
      http.get('*/api/v1/members/me', () => rs(me())),
    )
    const router = renderApp(
      '/mypage?chzzk=failed&code=CHANNEL_ALREADY_REGISTERED',
      'USER',
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '이미 다른 회원이 등록한 채널이에요.',
    )
    expect(router.state.location.pathname).toBe('/verify')
  })
})

describe('계정 설정', () => {
  it('닉네임 규칙을 어기면 저장할 수 없고, 바꾸면 상단 바 이름도 바뀐다', async () => {
    let saved: unknown
    server.use(
      http.patch('*/api/v1/members/me', async ({ request }) => {
        saved = await request.json()
        return rs(me({ nickname: '새벽 기타' }))
      }),
    )
    document.cookie = 'XSRF-TOKEN=t'
    renderApp('/settings', 'USER')

    const input = await screen.findByRole('textbox', { name: '닉네임' })
    const save = screen.getByRole('button', { name: '저장' })
    await userEvent.clear(input)
    await userEvent.type(input, '새벽  기타')
    expect(
      screen.getByText('닉네임에 공백을 연속으로 쓸 수 없어요.'),
    ).toBeInTheDocument()
    expect(save).toBeDisabled()

    await userEvent.clear(input)
    await userEvent.type(input, '새벽 기타')
    await userEvent.click(save)
    expect(await screen.findByText('닉네임을 바꿨어요.')).toBeInTheDocument()
    expect(saved).toEqual({ nickname: '새벽 기타' })
    // 상단 바는 닉네임을 아바타 메뉴에 둔다.
    expect(
      within(screen.getByRole('banner')).getByRole('button', {
        name: '새벽 기타 메뉴',
      }),
    ).toBeInTheDocument()
  })

  it('지원하지 않는 형식의 사진은 올리지 않는다', async () => {
    let uploads = 0
    server.use(
      http.put('*/api/v1/members/files/:memberId/content', () => {
        uploads++
        return rs(me())
      }),
    )
    renderApp('/settings', 'USER')
    const file = new File(['gif'], 'a.gif', { type: 'image/gif' })
    await userEvent.upload(
      await screen.findByLabelText('프로필 사진 파일'),
      file,
      {
        applyAccept: false,
      },
    )
    expect(
      await screen.findByText('프로필 사진은 jpeg·png·webp만 올릴 수 있어요.'),
    ).toBeInTheDocument()
    expect(uploads).toBe(0)
  })

  describe('관리자', () => {
    const admin = (patch: Partial<Me> = {}) => me({ role: 'ADMIN', ...patch })
    const avatarButton = (name: string) =>
      within(screen.getByRole('banner')).getByRole('button', { name })

    it('프로필 메뉴에서 계정 설정으로 간다', async () => {
      const router = renderApp('/admin', 'ADMIN')
      const avatar = await screen.findByRole('button', { name: '하늘 메뉴' })
      await userEvent.click(avatar)
      // 관리자 레일에는 계정 설정이 없으니 프로필 메뉴 안에서 찾는다.
      const menu = avatar.parentElement as HTMLElement
      await userEvent.click(
        within(menu).getByRole('link', { name: '계정 설정' }),
      )
      expect(router.state.location.pathname).toBe('/settings')
      expect(
        await screen.findByRole('heading', { level: 1, name: '계정 설정' }),
      ).toBeInTheDocument()
    })

    it('닉네임을 바꾸면 상단 프로필 메뉴 이름도 바뀐다', async () => {
      let saved: unknown
      server.use(
        http.patch('*/api/v1/members/me', async ({ request }) => {
          saved = await request.json()
          return rs(admin({ nickname: '운영자' }))
        }),
      )
      document.cookie = 'XSRF-TOKEN=t'
      renderApp('/settings', 'ADMIN')

      const input = await screen.findByRole('textbox', { name: '닉네임' })
      await userEvent.clear(input)
      await userEvent.type(input, '운영자')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))
      expect(await screen.findByText('닉네임을 바꿨어요.')).toBeInTheDocument()
      expect(saved).toEqual({ nickname: '운영자' })
      expect(avatarButton('운영자 메뉴')).toBeInTheDocument()
    })

    it('프로필 사진을 바꾸고 지우면 상단 아바타도 바뀐다', async () => {
      const url = 'https://cdn.example/admin.png'
      let uploadedTo: string | undefined
      server.use(
        http.put('*/api/v1/members/files/:memberId/content', ({ params }) => {
          uploadedTo = String(params.memberId)
          return rs(admin({ profileImageUrl: url }))
        }),
        http.delete('*/api/v1/members/me/profile-image', () => rs(admin())),
      )
      document.cookie = 'XSRF-TOKEN=t'
      renderApp('/settings', 'ADMIN')

      const file = new File(['png'], 'a.png', { type: 'image/png' })
      await userEvent.upload(
        await screen.findByLabelText('프로필 사진 파일'),
        file,
      )
      expect(
        await screen.findByText('프로필 사진을 바꿨어요.'),
      ).toBeInTheDocument()
      expect(uploadedTo).toBe(String(ME_ID))
      expect(avatarButton('하늘 메뉴').querySelector('img')).toHaveAttribute(
        'src',
        url,
      )

      await userEvent.click(screen.getByRole('button', { name: '지우기' }))
      expect(
        await screen.findByText('프로필 사진을 지웠어요.'),
      ).toBeInTheDocument()
      expect(avatarButton('하늘 메뉴').querySelector('img')).toBeNull()
    })
  })
})
