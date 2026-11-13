import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { memberKeys, memberProfileQuery } from '@/entities/member/api'
import type {
  MemberProfileDetail,
  MyChannel,
  ReceivedAppearanceReview,
} from '@/entities/member/types'
import type { Me } from '@/shared/auth/me'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { problem } from '@/test/emailCodeMock'
import { expectFieldError, expectNoFieldError } from '@/test/fieldError'
import { noAppearanceRating, noRating } from '@/test/memberProfile'
import { ME_ID, renderApp, rs, TEST_ACCESS_TOKEN } from '@/test/renderApp'
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
  vi.unstubAllGlobals()
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
              appearanceRating: noRating,
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
          appearanceRating: noAppearanceRating,
        }),
      ),
    )
    renderApp('/influencers', 'INFLUENCER')
    await userEvent.click(
      await screen.findByRole('link', { name: '편집하는 고래' }),
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
                    appearanceRating: noRating,
                  },
                ]
              : [],
          page: { size: 12, number: p, totalElements: 13, totalPages: 2 },
        })
      }),
    )
    const router = renderApp('/influencers?page=9', 'INFLUENCER')

    expect(
      await screen.findByRole('article', { name: '둘째 페이지 고래 2' }),
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe('?page=2')
    expect(
      screen.queryByText('아직 인증된 인플루언서가 없어요'),
    ).not.toBeInTheDocument()
  })

  it('목록 카드에 받은 출연 리뷰 전체 평점을 보여 준다', async () => {
    server.use(
      http.get('*/api/v1/members/influencers', () =>
        rs({
          content: [
            {
              id: 8,
              nickname: '편집하는 고래',
              role: 'VERIFIED_INFLUENCER',
              profileImageUrl: null,
              appearanceRating: { average: 4.5, count: 12 },
            },
            {
              id: 9,
              nickname: '새내기 수달',
              role: 'INFLUENCER',
              profileImageUrl: null,
              appearanceRating: noRating,
            },
          ],
          page: { size: 12, number: 0, totalElements: 2, totalPages: 1 },
        }),
      ),
    )
    renderApp('/influencers', 'INFLUENCER')

    const rated = await screen.findByRole('article', { name: '편집하는 고래' })
    expect(
      within(rated).getByLabelText('평점 4.5점, 리뷰 12개'),
    ).toBeInTheDocument()
    const unrated = screen.getByRole('article', { name: '새내기 수달' })
    expect(within(unrated).getByText('리뷰 없음')).toBeInTheDocument()
  })

  describe('프로필의 출연 평점과 받은 출연 리뷰 (#176)', () => {
    const MEMBER_ID = 8

    const detail = (
      patch: Partial<MemberProfileDetail> = {},
    ): MemberProfileDetail => ({
      id: MEMBER_ID,
      nickname: '편집하는 고래',
      role: 'VERIFIED_INFLUENCER',
      profileImageUrl: null,
      channels: [],
      appearanceRating: {
        total: { average: 4.5, count: 12 },
        asHost: { average: 4.7, count: 7 },
        asGuest: { average: 4.2, count: 5 },
      },
      ...patch,
    })

    const review = (
      patch: Partial<ReceivedAppearanceReview> = {},
    ): ReceivedAppearanceReview => ({
      reviewId: 31,
      appearanceId: 120,
      revieweeRole: 'HOST',
      rating: 5,
      content: '준비를 잘해 오셨어요',
      publishedAt: '2026-11-03T21:10:00',
      reviewer: { id: 42, nickname: '민규', profileImageUrl: null },
      ...patch,
    })

    const reviewPage = (
      content: ReceivedAppearanceReview[],
      number = 0,
      totalElements = content.length,
    ) => ({
      content,
      page: {
        size: 10,
        number,
        totalElements,
        totalPages: Math.ceil(totalElements / 10),
      },
    })

    const reviewsRegion = () =>
      screen.findByRole('region', { name: '받은 출연 리뷰' })

    it('프로필에 출연 평점을 전체와 호스트·게스트로 나눠 보여 준다', async () => {
      server.use(http.get(`*/api/v1/members/${MEMBER_ID}`, () => rs(detail())))
      renderApp(`/influencers/${MEMBER_ID}`, 'INFLUENCER')

      expect(
        await screen.findByLabelText('평점 4.5점, 리뷰 12개'),
      ).toBeInTheDocument()
      const region = await reviewsRegion()
      expect(
        within(
          within(region).getByRole('group', { name: '호스트로 받은 평점' }),
        ).getByLabelText('평점 4.7점, 리뷰 7개'),
      ).toBeInTheDocument()
      expect(
        within(
          within(region).getByRole('group', { name: '게스트로 받은 평점' }),
        ).getByLabelText('평점 4.2점, 리뷰 5개'),
      ).toBeInTheDocument()
    })

    it('받은 리뷰마다 쓴 회원·별점·받은 역할·본문을 보여 주고, 쓴 회원 프로필로 잇지 않는다', async () => {
      server.use(
        http.get(`*/api/v1/members/${MEMBER_ID}`, () => rs(detail())),
        http.get(`*/api/v1/members/${MEMBER_ID}/appearance-reviews`, () =>
          rs(
            reviewPage([
              review(),
              review({
                reviewId: 32,
                appearanceId: 121,
                revieweeRole: 'GUEST',
                rating: 3,
                content: null,
                reviewer: {
                  id: 43,
                  nickname: '탈퇴한 회원',
                  profileImageUrl: null,
                },
              }),
            ]),
          ),
        ),
      )
      renderApp(`/influencers/${MEMBER_ID}`, 'INFLUENCER')

      const region = await reviewsRegion()
      const [first, second] = await within(region).findAllByRole('article')
      expect(within(first).getByText('민규')).toBeInTheDocument()
      expect(within(first).getByLabelText('5점')).toBeInTheDocument()
      expect(within(first).getByText('호스트로 받음')).toBeInTheDocument()
      expect(
        within(first).getByText('준비를 잘해 오셨어요'),
      ).toBeInTheDocument()

      expect(within(second).getByText('탈퇴한 회원')).toBeInTheDocument()
      expect(within(second).getByLabelText('3점')).toBeInTheDocument()
      expect(within(second).getByText('게스트로 받음')).toBeInTheDocument()

      expect(within(region).queryByRole('link')).not.toBeInTheDocument()
    })

    it('받은 리뷰의 다음 페이지를 누르면 URL에 페이지를 두고 그 페이지를 불러온다', async () => {
      const requested: string[] = []
      server.use(
        http.get(`*/api/v1/members/${MEMBER_ID}`, () => rs(detail())),
        http.get(
          `*/api/v1/members/${MEMBER_ID}/appearance-reviews`,
          ({ request }) => {
            const params = new URL(request.url).searchParams
            requested.push(`${params.get('page')}/${params.get('size')}`)
            const page = Number(params.get('page'))
            return rs(
              reviewPage(
                [
                  review({
                    reviewId: 40 + page,
                    content: `${page + 1}쪽 리뷰`,
                  }),
                ],
                page,
                11,
              ),
            )
          },
        ),
      )
      const router = renderApp(`/influencers/${MEMBER_ID}`, 'INFLUENCER')

      const region = await reviewsRegion()
      expect(await within(region).findByText('1쪽 리뷰')).toBeInTheDocument()
      await userEvent.click(
        within(region).getByRole('button', { name: '다음' }),
      )

      expect(await within(region).findByText('2쪽 리뷰')).toBeInTheDocument()
      expect(router.state.location.search).toBe('?page=2')
      expect(requested).toEqual(['0/10', '1/10'])
    })

    it('받은 리뷰가 없으면 평점 대신 리뷰 없음과 빈 안내를 보여 준다', async () => {
      server.use(
        http.get(`*/api/v1/members/${MEMBER_ID}`, () =>
          rs(detail({ appearanceRating: noAppearanceRating })),
        ),
      )
      renderApp(`/influencers/${MEMBER_ID}`, 'INFLUENCER')

      const region = await reviewsRegion()
      expect(
        await within(region).findByText('아직 받은 출연 리뷰가 없어요.'),
      ).toBeInTheDocument()
      // 리뷰가 없으면 호스트·게스트로 나눈 평점은 두지 않는다
      expect(within(region).queryByRole('group')).not.toBeInTheDocument()
      expect(screen.getByText('리뷰 없음')).toBeInTheDocument()
    })

    it('다른 회원 프로필로 옮기면 그 회원의 리뷰가 올 때까지 앞 회원의 리뷰를 남기지 않는다', async () => {
      const OTHER_ID = 9
      let releaseOther = () => {}
      const otherReviews = new Promise<void>((resolve) => {
        releaseOther = resolve
      })
      server.use(
        http.get(`*/api/v1/members/${MEMBER_ID}`, () => rs(detail())),
        http.get(`*/api/v1/members/${OTHER_ID}`, () =>
          rs(detail({ id: OTHER_ID, nickname: '새내기 수달' })),
        ),
        http.get(`*/api/v1/members/${MEMBER_ID}/appearance-reviews`, () =>
          rs(reviewPage([review({ content: '고래가 받은 리뷰' })])),
        ),
        http.get(
          `*/api/v1/members/${OTHER_ID}/appearance-reviews`,
          async () => {
            await otherReviews
            return rs(reviewPage([review({ content: '수달이 받은 리뷰' })]))
          },
        ),
      )
      const router = renderApp(`/influencers/${MEMBER_ID}`, 'INFLUENCER')
      expect(
        await within(await reviewsRegion()).findByText('고래가 받은 리뷰'),
      ).toBeInTheDocument()

      // 옮길 회원의 프로필이 이미 캐시에 있으면 프로필 화면이 불러오는 중으로 바뀌지 않는다(뒤로·앞으로 이동 등)
      await queryClient.prefetchQuery(memberProfileQuery(OTHER_ID))
      await act(() => router.navigate(`/influencers/${OTHER_ID}`))

      expect(
        await screen.findByRole('heading', { name: '새내기 수달' }),
      ).toBeInTheDocument()
      const region = await reviewsRegion()
      expect(
        within(region).queryByText('고래가 받은 리뷰'),
      ).not.toBeInTheDocument()
      releaseOther()
      expect(
        await within(region).findByText('수달이 받은 리뷰'),
      ).toBeInTheDocument()
    })

    it('받은 리뷰를 불러오지 못해도(503) 프로필과 평점은 보이고, 다시 시도하면 리뷰를 불러온다', async () => {
      queryClient.setQueryDefaults(memberKeys.appearanceReviews(), {
        retry: false,
      })
      // 기본값은 queryClient.clear()로 지워지지 않으므로 이 테스트가 끝나면 되돌린다
      onTestFinished(() =>
        queryClient.setQueryDefaults(memberKeys.appearanceReviews(), {}),
      )
      let down = true
      server.use(
        http.get(`*/api/v1/members/${MEMBER_ID}`, () => rs(detail())),
        http.get(`*/api/v1/members/${MEMBER_ID}/appearance-reviews`, () =>
          down
            ? problem(
                503,
                'APPEARANCE_REVIEW_UNAVAILABLE',
                '지금은 출연 리뷰를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.',
              )
            : rs(reviewPage([review()])),
        ),
      )
      renderApp(`/influencers/${MEMBER_ID}`, 'INFLUENCER')

      const region = await reviewsRegion()
      expect(
        await within(region).findByText(
          /지금은 출연 리뷰를 불러올 수 없습니다/,
        ),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: '편집하는 고래' }),
      ).toBeInTheDocument()
      expect(screen.getByLabelText('평점 4.5점, 리뷰 12개')).toBeInTheDocument()

      down = false
      await userEvent.click(
        within(region).getByRole('button', { name: '다시 시도' }),
      )
      expect(
        await within(region).findByText('준비를 잘해 오셨어요'),
      ).toBeInTheDocument()
    })
  })
})

describe('채널 인증', () => {
  it('승인 요청이 자동 승인되면 새 역할 토큰을 받고 그 자리에서 인플루언서로 바뀐다', async () => {
    let role: Me['role'] = 'USER'
    const order: string[] = []
    server.use(
      http.get('*/api/v1/members/channels/me', () => rs([channel()])),
      http.post('*/api/v1/members/channels/3/approval-request', () => {
        role = 'INFLUENCER'
        return rs({ status: 'APPROVED', role })
      }),
      http.get('*/api/v1/members/me', ({ request }) => {
        order.push(`me ${request.headers.get('Authorization')}`)
        return rs(me({ role }))
      }),
    )
    const router = renderApp('/verify', 'USER')
    server.use(
      http.post('*/api/v1/members/auth/refresh', () => {
        order.push('refresh')
        return rs({ accessToken: 'influencer-token', expiresIn: 900 })
      }),
    )

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
      screen.queryByRole('button', { name: '치지직 채널 연동하기' }),
    ).toBeNull()
    const nav = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(
      within(nav).getByRole('link', { name: '내 출연' }),
    ).toBeInTheDocument()
    // 새 역할이 담긴 토큰을 먼저 받고 그 토큰으로 내 정보를 다시 부른다.
    expect(order.slice(0, 2)).toEqual(['refresh', 'me Bearer influencer-token'])
  })

  it('치지직 연동을 누르면 연동 주소를 받아 그 화면으로 이동한다', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    let authorization: string | null = null
    server.use(
      http.get('*/api/v1/members/channels/me', () => rs([])),
      http.post('*/api/v1/members/channels/chzzk/authorize', ({ request }) => {
        authorization = request.headers.get('Authorization')
        return rs({
          authorizeUrl: 'https://chzzk.naver.com/account-interlock?x=1',
        })
      }),
    )
    renderApp('/verify', 'USER')

    const connect = await screen.findByRole('button', {
      name: '치지직 채널 연동하기',
    })
    await userEvent.click(connect)

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        'https://chzzk.naver.com/account-interlock?x=1',
      ),
    )
    expect(authorization).toBe(`Bearer ${TEST_ACCESS_TOKEN}`)
    // 이동하는 동안 다시 누르지 않게 둔다.
    expect(connect).toBeDisabled()
  })

  it('치지직 연동으로 승인돼 돌아오면 새 역할 토큰을 받은 뒤 채널 인증 화면으로 간다', async () => {
    let refreshed = false
    server.use(
      http.get('*/api/v1/members/channels/me', () => rs([channel()])),
      http.get('*/api/v1/members/me', () =>
        rs(me({ role: refreshed ? 'INFLUENCER' : 'USER' })),
      ),
    )
    const router = renderApp('/mypage?chzzk=approved', 'USER')
    server.use(
      http.post('*/api/v1/members/auth/refresh', () => {
        refreshed = true
        return rs({ accessToken: 'influencer-token', expiresIn: 900 })
      }),
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/verify'))
    expect(refreshed).toBe(true)
    expect(await screen.findByText('인증 완료')).toBeInTheDocument()
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

  it('저장이 409 DUPLICATE_NICKNAME이면 토스트 대신 닉네임 칸 오류로 보이고, 고치면 지운 뒤 다시 저장한다', async () => {
    const saved: unknown[] = []
    server.use(
      http.patch('*/api/v1/members/me', async ({ request }) => {
        const body = (await request.json()) as { nickname: string }
        saved.push(body)
        return body.nickname === '새벽'
          ? problem(409, 'DUPLICATE_NICKNAME', '이미 쓰고 있는 닉네임이에요.')
          : rs(me({ nickname: body.nickname }))
      }),
    )
    renderApp('/settings', 'USER')

    const input = await screen.findByRole('textbox', { name: '닉네임' })
    const save = screen.getByRole('button', { name: '저장' })
    await userEvent.clear(input)
    await userEvent.type(input, '새벽')
    await userEvent.click(save)

    await waitFor(() => expectFieldError(input, '이미 쓰고 있는 닉네임이에요.'))
    expect(input).toHaveFocus()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '이미 쓰고 있는 닉네임이에요.',
    )
    expect(
      screen
        .queryAllByRole('status')
        .filter((el) => el.classList.contains('toast')),
    ).toHaveLength(0)
    expect(save).toBeDisabled()

    await userEvent.type(input, '별')
    expectNoFieldError(input)
    await userEvent.click(save)
    expect(await screen.findByText('닉네임을 바꿨어요.')).toBeInTheDocument()
    expect(saved).toEqual([{ nickname: '새벽' }, { nickname: '새벽별' }])
  })

  it('닉네임 칸을 벗어나면 중복을 확인해, 다른 회원이 쓰는 닉네임이면 칸 오류로 보이고 저장을 막는다', async () => {
    const checks: { nickname: string | null; auth: string | null }[] = []
    server.use(
      http.get('*/api/v1/members/nicknames/availability', ({ request }) => {
        const nickname = new URL(request.url).searchParams.get('nickname')
        checks.push({ nickname, auth: request.headers.get('Authorization') })
        return rs({ available: nickname !== '새벽' })
      }),
    )
    renderApp('/settings', 'USER')

    const input = await screen.findByRole('textbox', { name: '닉네임' })
    const save = screen.getByRole('button', { name: '저장' })
    await userEvent.clear(input)
    await userEvent.type(input, ' 새벽 ')
    await userEvent.tab()

    await waitFor(() => expectFieldError(input, '이미 쓰고 있는 닉네임이에요.'))
    expect(save).toBeDisabled()
    // 로그인한 회원으로 부른다(BE가 내 닉네임은 쓸 수 있다고 답한다).
    expect(checks).toEqual([
      { nickname: '새벽', auth: `Bearer ${TEST_ACCESS_TOKEN}` },
    ])

    // 고치면 확인 결과를 지우고, 다시 칸을 벗어나면 새 값으로 확인한다.
    await userEvent.type(input, '별')
    expectNoFieldError(input)
    expect(save).toBeEnabled()
    await userEvent.tab()
    await waitFor(() => expect(checks).toHaveLength(2))
    expect(checks[1].nickname).toBe('새벽 별')
    expectNoFieldError(input)
    expect(save).toBeEnabled()
  })

  it('내 닉네임 그대로거나 규칙에 맞지 않으면 중복 확인을 부르지 않는다', async () => {
    let checks = 0
    server.use(
      http.get('*/api/v1/members/nicknames/availability', () => {
        checks++
        return rs({ available: false })
      }),
    )
    renderApp('/settings', 'USER')

    const input = await screen.findByRole('textbox', { name: '닉네임' })
    await userEvent.click(input)
    await userEvent.tab()
    await userEvent.clear(input)
    await userEvent.type(input, '새')
    await userEvent.tab()
    expectFieldError(input, '닉네임은 2~12자로 입력해 주세요.')

    // 보내는 중인 요청도 없다(응답 전이면 checks만으로는 알 수 없다).
    expect(
      queryClient.isFetching({ queryKey: memberKeys.nicknameAvailability() }),
    ).toBe(0)
    expect(checks).toBe(0)
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
