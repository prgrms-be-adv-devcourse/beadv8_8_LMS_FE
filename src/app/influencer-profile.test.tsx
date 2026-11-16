import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { MemberProfileDetail } from '@/entities/member/types'
import { meQuery, type Me } from '@/shared/auth/me'
import type { Role } from '@/shared/auth/role'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { categoriesOf } from '@/test/contentCategories'
import { problem } from '@/test/emailCodeMock'
import { expectFieldError } from '@/test/fieldError'
import { mockUpdateMe } from '@/test/influencerSearchMock'
import { noAppearanceRating } from '@/test/memberProfile'
import { ME_ID, renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'
import { expectSuccessToast } from '@/test/toast'

const me = (patch: Partial<Me> = {}): Me => ({
  id: ME_ID,
  email: 'a@b.c',
  nickname: '하늘',
  role: 'INFLUENCER',
  status: 'ACTIVE',
  profileImageUrl: null,
  contentCategories: [],
  bio: null,
  ...patch,
})

const detail = (
  patch: Partial<MemberProfileDetail> = {},
): MemberProfileDetail => ({
  id: 8,
  nickname: '편집하는 고래',
  role: 'VERIFIED_INFLUENCER',
  profileImageUrl: null,
  channels: [],
  appearanceRating: noAppearanceRating,
  contentCategories: [],
  bio: null,
  ...patch,
})

/** 내 프로필(/profile/edit)을 연다. 미리보기는 내 정보 수정 결과를 따라간다 */
async function openMyProfile(initial: Me) {
  const state = mockUpdateMe(initial)
  server.use(
    http.get(`*/api/v1/members/${ME_ID}`, () =>
      rs(
        detail({
          id: ME_ID,
          nickname: state.me.nickname,
          role: state.me.role,
          contentCategories: state.me.contentCategories,
          bio: state.me.bio,
        }),
      ),
    ),
  )
  renderApp('/profile/edit', initial.role)
  queryClient.setQueryData(meQuery.queryKey, initial)
  await screen.findByRole('heading', { name: '콘텐츠 분야·자기소개' })
  return state
}

const categoryInput = () => screen.getByRole('textbox', { name: '콘텐츠 분야' })
const bioInput = () => screen.getByRole('textbox', { name: '자기소개' })
const saveButton = () => screen.getByRole('button', { name: '저장' })
const selectedChips = () =>
  within(screen.getByRole('list', { name: '고른 콘텐츠 분야' }))
    .getAllByRole('listitem')
    .map((li) => li.firstChild?.textContent)
const pickSuggestion = async (text: string, name: string) => {
  await userEvent.type(categoryInput(), text)
  await userEvent.click(
    within(screen.getByRole('group', { name: '분야 후보' })).getByRole(
      'button',
      { name },
    ),
  )
}
const preview = () => screen.getByRole('region', { name: '미리보기' })

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('내 프로필의 콘텐츠 분야·자기소개', () => {
  it('분야를 자동완성으로 고르고 순서를 바꿔, 자기소개와 함께 저장하면 미리보기에 그 순서로 보인다', async () => {
    const state = await openMyProfile(me())

    await pickSuggestion('메이', '메이플스토리')
    // 고른 분야는 후보에서 빠진다.
    await userEvent.type(categoryInput(), '메이')
    expect(screen.getByText('맞는 분야가 없어요.')).toBeInTheDocument()
    await userEvent.clear(categoryInput())
    await userEvent.type(categoryInput(), '게임{Enter}')
    expect(selectedChips()).toEqual(['메이플스토리', '게임'])
    await userEvent.click(screen.getByRole('button', { name: '게임 앞으로' }))
    expect(selectedChips()).toEqual(['게임', '메이플스토리'])

    await userEvent.type(bioInput(), '  메이플 방송 5년차입니다.  ')
    expect(screen.getByText(/^14\/100자/)).toBeInTheDocument()
    await userEvent.click(saveButton())

    await expectSuccessToast('프로필을 저장했어요.')
    expect(state.bodies).toEqual([
      {
        contentCategories: ['GAME', 'MAPLESTORY'],
        bio: '메이플 방송 5년차입니다.',
      },
    ])
    await waitFor(() =>
      expect(
        within(preview())
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual(['게임', '메이플스토리']),
    )
    expect(
      within(preview()).getByText('메이플 방송 5년차입니다.'),
    ).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('분야와 자기소개를 모두 지워 저장할 수 있다', async () => {
    const state = await openMyProfile(
      me({
        contentCategories: categoriesOf('GAME', 'MUSIC'),
        bio: '노래하는 게이머',
      }),
    )
    expect(
      await within(
        await screen.findByRole('region', { name: '미리보기' }),
      ).findByText('노래하는 게이머'),
    ).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: '게임 빼기' }))
    await userEvent.click(screen.getByRole('button', { name: '음악 빼기' }))
    await userEvent.clear(bioInput())
    await userEvent.click(saveButton())

    await expectSuccessToast('프로필을 저장했어요.')
    expect(state.bodies).toEqual([{ contentCategories: [], bio: '' }])
    // 둘 다 없으면 프로필에서 그 줄을 숨긴다.
    await waitFor(() =>
      expect(within(preview()).queryByText('노래하는 게이머')).toBeNull(),
    )
    expect(
      within(preview()).queryByRole('list', { name: '콘텐츠 분야' }),
    ).toBeNull()
  })

  it('5개를 고르면 더 고를 수 없게 막고 최대 5개를 안내한다', async () => {
    await openMyProfile(
      me({
        contentCategories: categoriesOf('GAME', 'MUSIC', 'TRAVEL', 'COOKING'),
      }),
    )
    expect(screen.getByText(/최대 5개 · 4\/5/)).toBeInTheDocument()

    await pickSuggestion('그림', '그림')

    expect(categoryInput()).toBeDisabled()
    expect(categoryInput()).toHaveAttribute(
      'placeholder',
      '최대 5개를 골랐어요',
    )
    expect(screen.getByText(/최대 5개 · 5\/5/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '분야 후보' })).toBeNull()
  })

  it('자기소개가 100자를 넘으면 칸 오류를 보이고 저장을 막는다', async () => {
    await openMyProfile(me())

    await userEvent.click(bioInput())
    await userEvent.paste('가'.repeat(101))

    expectFieldError(bioInput(), '자기소개는 100자 이하로 입력해 주세요.')
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('101/100자')).toBeInTheDocument()
  })

  it.each([
    [
      'INVALID_CONTENT_CATEGORY_COUNT',
      '콘텐츠 분야는 5개까지 고를 수 있어요.',
      'category',
    ],
    [
      'DUPLICATE_CONTENT_CATEGORY',
      '같은 콘텐츠 분야를 두 번 고를 수 없어요.',
      'category',
    ],
    ['INVALID_CONTENT_CATEGORY', '고를 수 없는 콘텐츠 분야예요.', 'category'],
    ['INVALID_BIO_LENGTH', '자기소개는 100자 이하로 입력해 주세요.', 'bio'],
  ] as const)(
    '저장이 400 %s면 그 칸 아래에 문구를 보이고, 값을 고치면 지운다',
    async (code, message, field) => {
      await openMyProfile(me())
      server.use(
        http.patch('*/api/v1/members/me', () => problem(400, code, message)),
      )

      await userEvent.type(categoryInput(), '게임{Enter}')
      await userEvent.type(bioInput(), '소개')
      await userEvent.click(saveButton())

      const input = field === 'category' ? categoryInput() : bioInput()
      await waitFor(() => expectFieldError(input, message))
      if (field === 'category')
        await userEvent.click(screen.getByRole('button', { name: '게임 빼기' }))
      else await userEvent.type(bioInput(), '글')
      expect(input).not.toHaveAttribute('aria-invalid')
    },
  )

  it('403 INFLUENCER_PROFILE_NOT_ALLOWED면 폼에 문구를 보이고 내 정보를 다시 받는다', async () => {
    await openMyProfile(me())
    let meCalls = 0
    server.use(
      http.patch('*/api/v1/members/me', () =>
        problem(
          403,
          'INFLUENCER_PROFILE_NOT_ALLOWED',
          '콘텐츠 분야와 자기소개는 인플루언서만 설정할 수 있어요.',
        ),
      ),
      http.get('*/api/v1/members/me', () => {
        meCalls++
        return rs(me())
      }),
    )

    await userEvent.type(bioInput(), '소개')
    await userEvent.click(saveButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '콘텐츠 분야와 자기소개는 인플루언서만 설정할 수 있어요.',
    )
    await waitFor(() => expect(meCalls).toBe(1))
  })

  it.each<Role>(['USER', 'ADMIN'])(
    '%s의 계정 설정에는 분야·자기소개 칸이 없고 닉네임만 보낸다',
    async (role) => {
      const state = mockUpdateMe(me({ role }))
      renderApp('/settings', role)

      const nickname = await screen.findByRole('textbox', { name: '닉네임' })
      expect(screen.queryByText('콘텐츠 분야')).toBeNull()
      expect(screen.queryByText('자기소개')).toBeNull()
      await userEvent.clear(nickname)
      await userEvent.type(nickname, '새벽 기타')
      await userEvent.click(screen.getByRole('button', { name: '저장' }))

      await expectSuccessToast('닉네임을 바꿨어요.')
      expect(state.bodies).toEqual([{ nickname: '새벽 기타' }])
    },
  )

  it('인플루언서의 계정 설정은 분야·자기소개를 바꾸는 내 프로필로 안내한다', async () => {
    renderApp('/settings', 'VERIFIED_INFLUENCER')

    await screen.findByRole('textbox', { name: '닉네임' })
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: '내 프로필' }),
    ).toHaveAttribute('href', '/profile/edit')
  })
})

describe('회원 프로필의 콘텐츠 분야·자기소개', () => {
  it('닉네임 아래에 분야(받은 순서)와 자기소개를 보인다. 이름이 빠진 분야는 목록에서 찾고 없으면 숨긴다', async () => {
    server.use(
      http.get('*/api/v1/members/8', () =>
        rs(
          detail({
            contentCategories: [
              { code: 'MAPLESTORY', name: '메이플스토리' },
              { code: 'GAME', name: null },
              { code: 'GONE', name: null },
            ],
            bio: '메이플 방송 5년차입니다.\n주말엔 합방해요.',
          }),
        ),
      ),
    )
    renderApp('/influencers/8', 'INFLUENCER')

    await screen.findByRole('heading', { name: '편집하는 고래' })
    const chips = screen.getByRole('list', { name: '콘텐츠 분야' })
    await waitFor(() =>
      expect(
        within(chips)
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual(['메이플스토리', '게임']),
    )
    expect(
      screen.getByText(/메이플 방송 5년차입니다.\s+주말엔 합방해요./),
    ).toBeInTheDocument()
  })
})
