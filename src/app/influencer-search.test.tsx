import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { memberKeys } from '@/entities/member/api'
import type { MemberProfile } from '@/entities/member/types'
import { closeLoginModal } from '@/shared/ui/loginModal'
import { categoriesOf } from '@/test/contentCategories'
import {
  brokenPhotoUrl,
  mockInfluencerSearch,
  mockManySearchResults,
  mockProfileImages,
  photoUrl,
} from '@/test/influencerSearchMock'
import { noRating } from '@/test/memberProfile'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

/** 기본 목록(회원 API). 부른 횟수를 센다 */
function mockList(content: MemberProfile[] = [listMember()]) {
  const calls = { count: 0 }
  server.use(
    http.get('*/api/v1/members/influencers', () => {
      calls.count++
      return rs({
        content,
        page: {
          size: 12,
          number: 0,
          totalElements: content.length,
          totalPages: 1,
        },
      })
    }),
  )
  return calls
}

function listMember(patch: Partial<MemberProfile> = {}): MemberProfile {
  return {
    id: 8,
    nickname: '편집하는 고래',
    role: 'VERIFIED_INFLUENCER',
    profileImageUrl: null,
    appearanceRating: noRating,
    contentCategories: [],
    ...patch,
  }
}

const searchBox = () =>
  screen.getByRole('searchbox', { name: '인플루언서 검색' })
const select = (name: string) => screen.getByRole('combobox', { name })
const card = (name: string) => screen.findByRole('article', { name })
const lastParams = (requests: URLSearchParams[]) =>
  Object.fromEntries(requests.at(-1)!)

afterEach(() => {
  queryClient.clear()
  closeLoginModal()
})

describe('인플루언서 목록과 검색 나누기', () => {
  it('조건이 없으면 회원 API의 전체 목록을 보이고 검색 API를 부르지 않는다', async () => {
    const list = mockList([
      listMember({
        contentCategories: categoriesOf(
          'MAPLESTORY',
          'GAME',
          'MUSIC',
          'COOKING',
          'TRAVEL',
        ),
      }),
    ])
    const requests = mockInfluencerSearch()
    renderApp('/influencers', 'INFLUENCER')

    const whale = await card('편집하는 고래')
    expect(
      screen.getByRole('heading', { name: '전체 인플루언서' }),
    ).toBeInTheDocument()
    // 분야 칩은 받은 순서로 3개까지, 나머지는 +n
    const chips = within(whale).getByRole('list', { name: '콘텐츠 분야' })
    expect(
      within(chips)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['메이플스토리', '게임', '음악', '+2'])
    expect(within(chips).getByLabelText('그 밖에 2개: 요리, 여행')).toBe(
      within(chips).getByText('+2'),
    )
    expect(list.count).toBe(1)
    expect(requests).toHaveLength(0)
  })

  it('검색어는 입력을 멈춘 뒤 한 번만 찾고 URL에 남긴다. 조건을 모두 지우면 전체 목록으로 돌아간다', async () => {
    mockList()
    mockProfileImages()
    const requests = mockInfluencerSearch()
    const router = renderApp('/influencers', 'INFLUENCER')
    await card('편집하는 고래')

    await userEvent.type(searchBox(), '메이플')
    // 글자마다 부르지 않는다.
    expect(requests).toHaveLength(0)

    expect(
      await screen.findByRole('heading', { name: '검색 결과 3명' }),
    ).toBeInTheDocument()
    expect(requests).toHaveLength(1)
    expect(lastParams(requests)).toEqual({
      keyword: '메이플',
      page: '0',
      size: '20',
    })
    expect(router.state.location.search).toBe(
      `?keyword=${encodeURIComponent('메이플')}`,
    )
    expect(await card('메이플고수')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '편집하는 고래' })).toBeNull()

    await userEvent.click(
      screen.getByRole('button', { name: '조건 모두 지우기' }),
    )
    expect(await card('편집하는 고래')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '전체 인플루언서' }),
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    expect(searchBox()).toHaveValue('')
  })

  it('Enter는 기다리지 않고 바로 찾는다', async () => {
    mockList()
    mockProfileImages()
    const requests = mockInfluencerSearch()
    renderApp('/influencers', 'INFLUENCER')
    await card('편집하는 고래')

    await userEvent.type(searchBox(), '롤{Enter}')

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(lastParams(requests).keyword).toBe('롤')
    expect(await card('롤하는 수달')).toBeInTheDocument()
  })

  it('검색어는 100자까지만 입력할 수 있다', async () => {
    mockList()
    renderApp('/influencers', 'INFLUENCER')
    await card('편집하는 고래')

    expect(searchBox()).toHaveAttribute('maxLength', '100')
  })
})

describe('검색 필터와 정렬', () => {
  it('분야·인증 여부·최소 팔로워·최소 평점과 정렬이 쿼리로 나가고 URL에 남는다', async () => {
    mockList()
    mockProfileImages()
    const requests = mockInfluencerSearch()
    const router = renderApp('/influencers', 'INFLUENCER')
    await card('편집하는 고래')

    const categories = screen.getByRole('textbox', { name: '콘텐츠 분야' })
    await userEvent.type(categories, '게임{Enter}')
    await userEvent.type(categories, '메이플')
    await userEvent.click(
      within(screen.getByRole('group', { name: '분야 후보' })).getByRole(
        'button',
        { name: '메이플스토리' },
      ),
    )
    await userEvent.selectOptions(select('인증 여부'), '인증된 인플루언서')
    await userEvent.selectOptions(select('최소 팔로워'), '팔로워 1만 명 이상')
    await userEvent.selectOptions(select('최소 출연 평점'), '★ 4.0 이상')
    await userEvent.selectOptions(select('정렬'), '출연 평점 높은 순')

    await waitFor(() =>
      expect(lastParams(requests)).toEqual({
        contentCategories: 'GAME,MAPLESTORY',
        verified: 'true',
        minFollowers: '10000',
        minRating: '4',
        sort: 'rating,desc',
        page: '0',
        size: '20',
      }),
    )
    expect(
      Object.fromEntries(new URLSearchParams(router.state.location.search)),
    ).toEqual({
      contentCategories: 'GAME,MAPLESTORY',
      verified: 'true',
      minFollowers: '10000',
      minRating: '4',
      sort: 'rating',
    })
    expect(
      screen.getByText(/출연 평점 높은 순은 리뷰 수를 함께 반영한 순서예요/),
    ).toBeInTheDocument()
    // 인증·팔로워 1만·평점 4.0 이상이면서 게임·메이플 분야: 메이플고수(4.5)·로아 원정대(4.3)·배그 장인(3.9 → 빠짐)
    expect(
      await screen.findByRole('heading', { name: '검색 결과 2명' }),
    ).toBeInTheDocument()
    const names = screen
      .getAllByRole('article')
      .map((a) => a.getAttribute('aria-labelledby'))
      .map((id) => document.getElementById(id!)!.textContent)
    expect(names).toEqual(['메이플고수', '로아 원정대'])
  })

  it('인증 안 된 인플루언서·팔로워 많은 순은 verified=false·sort=followers,desc로 보낸다', async () => {
    mockList()
    mockProfileImages()
    const requests = mockInfluencerSearch()
    renderApp('/influencers', 'INFLUENCER')
    await card('편집하는 고래')

    await userEvent.selectOptions(select('인증 여부'), '인증 안 된 인플루언서')
    await userEvent.selectOptions(select('정렬'), '팔로워 많은 순')

    await waitFor(() =>
      expect(lastParams(requests)).toEqual({
        verified: 'false',
        sort: 'followers,desc',
        page: '0',
        size: '20',
      }),
    )
  })

  it('URL의 조건으로 다시 열면(새로 고침) 같은 조건으로 찾고 칸에 채워 둔다', async () => {
    mockList()
    mockProfileImages()
    const requests = mockInfluencerSearch()
    renderApp(
      '/influencers?keyword=%EB%A9%94%EC%9D%B4%ED%94%8C&contentCategories=GAME&verified=true&minFollowers=1000&minRating=4.5&sort=followers&page=1',
      'INFLUENCER',
    )

    await waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(Object.fromEntries(requests[0])).toEqual({
      keyword: '메이플',
      contentCategories: 'GAME',
      verified: 'true',
      minFollowers: '1000',
      minRating: '4.5',
      sort: 'followers,desc',
      page: '0',
      size: '20',
    })
    expect(searchBox()).toHaveValue('메이플')
    expect(select('인증 여부')).toHaveValue('true')
    expect(select('최소 팔로워')).toHaveValue('1000')
    expect(select('최소 출연 평점')).toHaveValue('4.5')
    expect(select('정렬')).toHaveValue('followers')
    expect(
      within(screen.getByRole('list', { name: '고른 콘텐츠 분야' })).getByText(
        '게임',
      ),
    ).toBeInTheDocument()
  })

  it('조건을 바꾸면 첫 페이지로 돌아간다', async () => {
    mockList()
    mockProfileImages()
    mockManySearchResults(60)
    const router = renderApp('/influencers?sort=followers', 'INFLUENCER')

    await userEvent.click(await screen.findByRole('button', { name: '다음' }))
    await waitFor(() =>
      expect(router.state.location.search).toBe('?sort=followers&page=2'),
    )
    await userEvent.selectOptions(select('인증 여부'), '인증된 인플루언서')

    await waitFor(() =>
      expect(router.state.location.search).toBe(
        '?verified=true&sort=followers',
      ),
    )
  })
})

describe('검색 결과 카드와 사진', () => {
  it('사진은 페이지 회원 ID로 한 번에 받고, 카드에 인증 배지·분야·대표 채널·평점·자기소개를 보인다', async () => {
    mockList()
    const images = mockProfileImages({ noPhoto: [121] })
    mockInfluencerSearch()
    renderApp('/influencers?keyword=%EB%A9%94%EC%9D%B4%ED%94%8C', 'INFLUENCER')

    const pro = await card('메이플고수')
    expect(images).toEqual(['124,101,121'])
    await waitFor(() =>
      expect(pro.querySelector('img')).toHaveAttribute('src', photoUrl(101)),
    )
    expect(within(pro).getByText('인증된 인플루언서')).toHaveClass('pill')
    expect(
      within(pro)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['메이플스토리', '게임'])
    expect(
      within(pro).getByText('메이플고수TV · 팔로워 15,200명'),
    ).toBeInTheDocument()
    expect(
      within(pro).getByLabelText('평점 4.5점, 리뷰 12개'),
    ).toBeInTheDocument()
    expect(
      within(pro).getByText('메이플 방송 5년차입니다.'),
    ).toBeInTheDocument()
    expect(
      within(pro).getByRole('link', { name: '메이플고수' }),
    ).toHaveAttribute('href', '/influencers/101')

    // 채널·리뷰·사진이 없는 회원
    const newbie = screen.getByRole('article', { name: '메이플 뉴비' })
    expect(newbie.querySelector('img')).toBeNull()
    expect(within(newbie).getByText('리뷰 없음')).toBeInTheDocument()
    expect(within(newbie).queryByText(/팔로워/)).toBeNull()
  })

  it('사진을 불러오지 못하면 그 회원만 한 번 다시 받고, 또 실패하면 기본 이미지로 둔다', async () => {
    mockList()
    const images = mockProfileImages({ broken: [101] })
    mockInfluencerSearch()
    renderApp('/influencers?keyword=%EB%A9%94%EC%9D%B4%ED%94%8C', 'INFLUENCER')

    const pro = await card('메이플고수')
    await waitFor(() =>
      expect(pro.querySelector('img')).toHaveAttribute(
        'src',
        brokenPhotoUrl(101),
      ),
    )
    fireEvent.error(pro.querySelector('img')!)

    await waitFor(() =>
      expect(pro.querySelector('img')).toHaveAttribute('src', photoUrl(101)),
    )
    expect(images).toEqual(['124,101,121', '101'])

    fireEvent.error(pro.querySelector('img')!)
    await waitFor(() => expect(pro.querySelector('img')).toBeNull())
    expect(within(pro).getByText('메')).toHaveClass('avatar')
    expect(images).toHaveLength(2)
  })

  it('사진을 일괄 조회로 새로 받거나 다른 조건에서 다시 나오면, 기본 이미지로 둔 회원도 새 주소를 쓰고 다시 한 번 재시도한다', async () => {
    mockList()
    const images = mockProfileImages({ broken: [101] })
    mockInfluencerSearch()
    renderApp('/influencers?keyword=%EB%A9%94%EC%9D%B4%ED%94%8C', 'INFLUENCER')

    const pro = await card('메이플고수')
    const img = () => pro.querySelector('img')
    await waitFor(() =>
      expect(img()).toHaveAttribute('src', brokenPhotoUrl(101)),
    )
    fireEvent.error(img()!)
    await waitFor(() => expect(img()).toHaveAttribute('src', photoUrl(101)))
    fireEvent.error(img()!)
    await waitFor(() => expect(img()).toBeNull())

    // 같은 페이지의 일괄 조회를 새로 받으면 그 주소를 쓰고, 실패하면 다시 한 번 그 회원만 받는다.
    await act(() =>
      queryClient.invalidateQueries({ queryKey: memberKeys.profileImages() }),
    )
    await waitFor(() =>
      expect(img()).toHaveAttribute('src', brokenPhotoUrl(101)),
    )
    fireEvent.error(img()!)
    await waitFor(() => expect(img()).toHaveAttribute('src', photoUrl(101)))
    expect(images).toEqual(['124,101,121', '101', '124,101,121', '101'])

    // 다른 조건에서 같은 회원이 나오면 그 조건의 일괄 조회 주소를 쓴다.
    fireEvent.error(img()!)
    await waitFor(() => expect(img()).toBeNull())
    await userEvent.clear(searchBox())
    await userEvent.type(searchBox(), '메이플고수{Enter}')
    await waitFor(() =>
      expect(
        screen
          .getByRole('article', { name: '메이플고수' })
          .querySelector('img'),
      ).toHaveAttribute('src', photoUrl(101)),
    )
  })

  it('조건을 바꾸는 동안 이전 결과를 흐리게 두고, 늦게 온 이전 검색의 응답은 버린다', async () => {
    mockList()
    mockProfileImages()
    let release!: () => void
    const requests = mockInfluencerSearch({
      hold: {
        keyword: '롤',
        until: new Promise<void>((resolve) => (release = resolve)),
      },
    })
    renderApp('/influencers?keyword=%EB%B0%B0%EA%B7%B8', 'INFLUENCER')
    expect(await card('배그 장인')).toBeInTheDocument()

    await userEvent.clear(searchBox())
    await userEvent.type(searchBox(), '롤{Enter}')
    await waitFor(() => expect(lastParams(requests).keyword).toBe('롤'))
    // 롤의 응답을 기다리는 동안 이전 결과(배그)를 흐리게 둔다.
    const grid = screen.getByRole('article', {
      name: '배그 장인',
    }).parentElement!
    expect(grid).toHaveAttribute('aria-busy', 'true')

    await userEvent.clear(searchBox())
    await userEvent.type(searchBox(), '로아{Enter}')
    expect(await card('로아 원정대')).toBeInTheDocument()
    release()
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect(screen.queryByRole('article', { name: '롤하는 수달' })).toBeNull()
    expect(
      screen.getByRole('article', { name: '로아 원정대' }),
    ).toBeInTheDocument()
  })
})

describe('검색 결과가 없거나 검색할 수 없을 때', () => {
  it('0건이면 안내와 필터 초기화를 보이고, 누르면 전체 목록으로 돌아간다', async () => {
    mockList()
    mockProfileImages()
    mockInfluencerSearch()
    const router = renderApp(
      '/influencers?keyword=%EC%97%86%EB%8A%94%EC%82%AC%EB%9E%8C&verified=true',
      'INFLUENCER',
    )

    expect(
      await screen.findByText('조건에 맞는 인플루언서가 없어요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('검색어나 필터를 바꿔 보세요.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '필터 초기화' }))

    expect(await card('편집하는 고래')).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })

  it('503 SEARCH_UNAVAILABLE이면 다시 시도하지 않고 안내하며, 전체 목록 보기로 기본 목록을 쓴다', async () => {
    mockList()
    const requests = mockInfluencerSearch({ unavailable: true })
    const router = renderApp('/influencers?verified=true', 'INFLUENCER')

    expect(
      await screen.findByText(
        '지금은 검색할 수 없어요. 잠시 후 다시 시도해 주세요.',
      ),
    ).toBeInTheDocument()
    expect(requests).toHaveLength(1)
    await userEvent.click(
      screen.getByRole('button', { name: '전체 목록 보기' }),
    )

    expect(await card('편집하는 고래')).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })

  it('1,000건을 넘는 페이지면 PAGE_TOO_DEEP 안내와 첫 페이지로 가기를 보인다', async () => {
    mockList()
    mockProfileImages()
    mockManySearchResults(5000)
    const router = renderApp(
      '/influencers?sort=followers&page=51',
      'INFLUENCER',
    )

    expect(
      await screen.findByText('검색 결과는 앞에서 1,000건까지만 볼 수 있어요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('검색어나 조건을 좁혀 주세요.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '첫 페이지로' }))

    expect(
      await screen.findByRole('heading', { name: '검색 결과 1,000명 이상' }),
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe('?sort=followers')
    // 페이지 버튼은 볼 수 있는 1,000건(20개씩 50페이지)까지만 만든다.
    expect(screen.getByText('1 / 50')).toBeInTheDocument()
  })
})
