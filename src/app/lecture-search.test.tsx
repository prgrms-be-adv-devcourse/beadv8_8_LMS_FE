import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import type { LectureSummary } from '@/entities/lecture/types'
import {
  BROKEN_FIRST_ID,
  mockLectureSearch,
  SEARCH_DOCS,
  thumbnailUrl,
} from '@/test/lectureSearchMock'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

afterEach(() => queryClient.clear())

const summary = (id: number, title: string): LectureSummary => ({
  lectureId: id,
  title,
  priceHp: 10000,
  thumbnailUrl: null,
  sellerUserId: 99,
  sellerNickname: '하루',
  averageRating: null,
  reviewCount: 0,
})

/** 강의 목록 API(검색어 없을 때). 받은 sort를 모은다 */
function mockLectureList() {
  const sorts: (string | null)[] = []
  server.use(
    http.get('*/api/v1/lectures', ({ request }) => {
      sorts.push(new URL(request.url).searchParams.get('sort'))
      return rs({
        content: [summary(1, '전체 목록 강의')],
        page: { size: 12, number: 0, totalElements: 1, totalPages: 1 },
      })
    }),
  )
  return sorts
}

/** 검색어(와 그 밖의 쿼리)를 담은 강의 화면 주소 */
const at = (keyword: string, rest = '') =>
  `/lectures?keyword=${encodeURIComponent(keyword)}${rest}`

const searchBox = () => screen.getByRole('combobox', { name: '강의 검색' })

/** 검색 결과 카드(비회원은 버튼) */
const resultCard = (name: RegExp) => screen.findByRole('button', { name })

describe('강의 검색', () => {
  it('검색어가 없으면 강의 목록 API, 입력을 멈추면 한 번만 검색 API를 부르고 검색 조건을 URL에 둔다', async () => {
    const listSorts = mockLectureList()
    const search = mockLectureSearch()
    const router = renderApp('/lectures', 'GUEST')

    expect(
      await screen.findByRole('heading', { name: '전체 강의' }),
    ).toBeInTheDocument()
    expect(listSorts).toEqual(['LATEST'])

    await userEvent.type(searchBox(), '  프리미어 ')
    expect(
      await screen.findByRole('heading', { name: /‘프리미어’ 검색 결과/ }),
    ).toHaveTextContent('4개')
    // 글자마다 부르지 않는다
    expect(search.searches).toHaveLength(1)
    expect(search.searches[0].get('keyword')).toBe('프리미어')
    expect(search.searches[0].get('sort')).toBeNull()
    expect(search.searches[0].get('size')).toBe('20')
    expect(router.state.location.search).toBe(
      `?keyword=${encodeURIComponent('프리미어')}`,
    )
    // 정리한 값을 URL에 써도 입력 중인 공백은 그대로 둔다
    expect(searchBox()).toHaveValue('  프리미어 ')
    // 강의 목록 API의 keyword는 쓰지 않는다
    expect(listSorts).toEqual(['LATEST'])

    // 검색어를 지우면 기본 목록으로 돌아간다
    await userEvent.clear(searchBox())
    expect(
      await screen.findByRole('heading', { name: '전체 강의' }),
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })

  it('엔터는 debounce를 기다리지 않고 바로 검색하고, 뒤로 가기로 검색 전 주소로 돌아간다', async () => {
    mockLectureList()
    const search = mockLectureSearch()
    const router = renderApp('/lectures', 'GUEST')
    await screen.findByRole('heading', { name: '전체 강의' })

    await userEvent.type(searchBox(), '편집{Enter}')
    await waitFor(() =>
      expect(router.state.location.search).toBe(
        `?keyword=${encodeURIComponent('편집')}`,
      ),
    )
    await screen.findByRole('heading', { name: /‘편집’ 검색 결과/ })
    expect(search.searches).toHaveLength(1)

    await act(() => router.navigate(-1))
    expect(router.state.location.search).toBe('')
    expect(searchBox()).toHaveValue('')
  })

  it('검색어는 50자를 넘게 입력할 수 없다', async () => {
    mockLectureList()
    mockLectureSearch()
    renderApp('/lectures', 'GUEST')
    await screen.findByRole('heading', { name: '전체 강의' })

    expect(searchBox()).toHaveAttribute('maxLength', '50')
  })

  it.each([
    ['DEFAULT', null, 'LATEST'],
    ['LATEST', 'latest,desc', 'LATEST'],
    ['PRICE_ASC', 'price,asc', 'PRICE_ASC'],
    ['PRICE_DESC', 'price,desc', 'PRICE_DESC'],
    ['RATING', 'rating,desc', 'RATING'],
  ])(
    '정렬 %s는 검색 API에 %s, 목록 API에 %s로 보낸다',
    async (sort, searchSort, listSort) => {
      const listSorts = mockLectureList()
      const search = mockLectureSearch()
      const query = sort === 'DEFAULT' ? '' : `&sort=${sort}`
      const router = renderApp(at('편집', query), 'GUEST')

      await screen.findByRole('heading', { name: /‘편집’ 검색 결과/ })
      expect(search.searches.at(-1)?.get('sort')).toBe(searchSort)
      expect(
        screen.queryByText('리뷰 수를 함께 반영한 순서예요') !== null,
      ).toBe(sort === 'RATING')

      // 검색어를 지우면 같은 정렬로 목록 API를 부른다
      await userEvent.clear(searchBox())
      await screen.findByRole('heading', { name: '전체 강의' })
      expect(listSorts.at(-1)).toBe(listSort)
      expect(router.state.location.search).toBe(query.replace('&', '?'))
    },
  )

  it('정렬을 바꾸면 URL에 남기고 첫 페이지로 돌린다', async () => {
    mockLectureList()
    const search = mockLectureSearch()
    const router = renderApp(at('편집', '&page=2'), 'GUEST')
    await screen.findByRole('heading', { name: /‘편집’ 검색 결과/ })
    expect(
      within(screen.getByRole('combobox', { name: '정렬' })).getByRole(
        'option',
        { selected: true },
      ),
    ).toHaveTextContent('관련도순')

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '정렬' }),
      'PRICE_ASC',
    )
    await waitFor(() =>
      expect(search.searches.at(-1)?.get('sort')).toBe('price,asc'),
    )
    expect(search.searches.at(-1)?.get('page')).toBe('0')
    expect(router.state.location.search).toBe(
      '?keyword=%ED%8E%B8%EC%A7%91&sort=PRICE_ASC',
    )
  })

  it('검색어가 걸린 곳을 강조하고 escape 문자는 원래 글자로, 원문 칸은 글자 그대로 보인다', async () => {
    mockLectureSearch()
    renderApp(at('프리미어'), 'GUEST')

    const card = await resultCard(/프리미어 컷편집 입문/)
    const hits = within(card).getAllByText('프리미어', { selector: 'em' })
    // 제목·소개 조각·콘텐츠 제목
    expect(hits).toHaveLength(3)
    expect(hits[0].parentElement).toHaveTextContent(/^프리미어 컷편집 입문$/)
    // 소개 조각: &quot;가 따옴표로 보인다
    expect(card).toHaveTextContent(
      '처음 쓰는 분도 프리미어로 브이로그를 "빠르게" 만들 수 있게',
    )
    expect(card.textContent).not.toContain('&quot;')
    expect(card).toHaveTextContent('강의 내용: 2강 프리미어 화면 구성')
    expect(card).toHaveTextContent('★ 4.5 (12)')
    expect(card).toHaveTextContent('30,000 HP')

    // 제목의 &amp;는 &로 보인다
    const ampersand = await resultCard(/프리미어 자막 & 효과/)
    expect(ampersand.textContent).not.toContain('&amp;')
    // 소개에만 걸린 강의는 제목을 원문 그대로 보이고 소개 조각에 강조한다
    const descOnly = await resultCard(/컬러 보정 기초/)
    expect(
      within(descOnly).getByText('프리미어', { selector: 'em' }),
    ).toBeInTheDocument()
    expect(descOnly).toHaveTextContent('R&D')
  })

  it('가격을 모르면 가격을, 판매자 닉네임을 모르면 닉네임을 숨기고 리뷰가 없으면 리뷰 없음이다', async () => {
    mockLectureSearch({
      docs: SEARCH_DOCS.filter((d) => [3, 15, 16].includes(d.lectureId)),
    })
    // 세 강의 모두 콘텐츠 제목 '1강 시작하기'에 걸린다
    renderApp(at('시작'), 'GUEST')

    const noPrice = await resultCard(/숏폼 세로 편집/)
    expect(noPrice).not.toHaveTextContent('HP')
    const noSeller = await resultCard(/방송 장비 가이드/)
    expect(noSeller).toHaveTextContent('방송 장비 가이드★ 4.9 (40)16,000 HP')
    const noReview = await resultCard(/OBS 장면 전환/)
    expect(noReview).toHaveTextContent('리뷰 없음')
  })

  it('썸네일은 페이지마다 한 번에 받고, 불러오지 못하면 그 강의만 한 번 다시 받고 또 실패하면 기본 이미지다', async () => {
    const search = mockLectureSearch()
    renderApp(at('프리미어'), 'GUEST')

    const card = await resultCard(/프리미어 컷편집 입문/)
    const img = await waitFor(() => {
      const found = card.querySelector('img')
      expect(found).not.toBeNull()
      return found as HTMLImageElement
    })
    expect(img.src).toBe(thumbnailUrl(BROKEN_FIRST_ID, 1))
    // 한 페이지의 강의 ID로 한 번만 부른다
    expect(search.thumbnails).toHaveLength(1)
    expect(search.thumbnails[0].split(',').sort()).toEqual([
      '11',
      '12',
      '13',
      '14',
    ])
    // 썸네일이 없는 강의(null)는 기본 이미지다
    expect((await resultCard(/프리미어 자막/)).querySelector('img')).toBeNull()

    fireEvent.error(img)
    await waitFor(() =>
      expect(card.querySelector('img')?.src).toBe(
        thumbnailUrl(BROKEN_FIRST_ID, 2),
      ),
    )
    expect(search.thumbnails.slice(1)).toEqual(['11'])

    fireEvent.error(card.querySelector('img') as HTMLImageElement)
    await waitFor(() => expect(card.querySelector('img')).toBeNull())
    // 기본 이미지(강의 색 카드)에 제목을 보인다
    expect(within(card).getByText('프리미어 컷편집 입문')).toBeInTheDocument()
    expect(search.thumbnails).toHaveLength(2)
  })

  it('다시 받기 기록은 결과 페이지마다 두어, 다른 검색에서 같은 강의가 나오면 새로 받은 썸네일을 쓴다', async () => {
    const search = mockLectureSearch()
    const router = renderApp(at('프리미어'), 'GUEST')

    const card = await resultCard(/프리미어 컷편집 입문/)
    const img = await waitFor(() => {
      const found = card.querySelector('img')
      expect(found).not.toBeNull()
      return found as HTMLImageElement
    })
    fireEvent.error(img)
    await waitFor(() =>
      expect(card.querySelector('img')?.src).toBe(
        thumbnailUrl(BROKEN_FIRST_ID, 2),
      ),
    )
    fireEvent.error(card.querySelector('img') as HTMLImageElement)
    await waitFor(() => expect(card.querySelector('img')).toBeNull())

    // 다른 검색어의 결과 페이지에서 같은 강의는 새 일괄 조회 주소로 보인다
    await act(() => router.navigate(at('컷편집')))
    const again = await resultCard(/프리미어 컷편집 입문/)
    await waitFor(() =>
      expect(again.querySelector('img')?.src).toBe(
        thumbnailUrl(BROKEN_FIRST_ID, 3),
      ),
    )
    expect(search.thumbnails.at(-1)?.split(',')).toContain(
      String(BROKEN_FIRST_ID),
    )
  })

  it('결과가 없으면 안내와 전체 강의 보기를 보인다', async () => {
    mockLectureList()
    mockLectureSearch()
    const router = renderApp(at('없는 말'), 'GUEST')

    expect(await screen.findByText('검색 결과가 없어요.')).toBeInTheDocument()
    expect(screen.getByText('다른 검색어로 찾아보세요.')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: '전체 강의 보기' }),
    )
    expect(
      await screen.findByRole('heading', { name: '전체 강의' }),
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    expect(searchBox()).toHaveValue('')
  })

  it('1,000건을 넘겨 보려 하면(PAGE_TOO_DEEP) 안내하고 첫 페이지로 돌아갈 수 있다', async () => {
    const search = mockLectureSearch()
    // 20개씩이라 51쪽(page=50)은 1,020건째까지다
    const router = renderApp(at('편집', '&page=51'), 'GUEST')

    expect(
      await screen.findByText('검색 결과는 앞에서 1,000건까지만 볼 수 있어요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('검색어를 좁혀 주세요.')).toBeInTheDocument()
    expect(search.searches[0].get('page')).toBe('50')

    await userEvent.click(screen.getByRole('button', { name: '첫 페이지로' }))
    await screen.findByRole('heading', { name: /‘편집’ 검색 결과/ })
    expect(router.state.location.search).toBe('?keyword=%ED%8E%B8%EC%A7%91')
  })

  it('호출 제한(429)이면 안내하고 Retry-After초 뒤에 다시 검색한다', async () => {
    const search = mockLectureSearch({ retryAfter: '1' })
    search.fail('TOO_MANY_REQUESTS')
    renderApp(at('편집'), 'GUEST')

    expect(
      await screen.findByText(
        '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('1초 뒤에 다시 검색해요.')).toBeInTheDocument()
    expect(search.searches).toHaveLength(1)

    expect(
      await screen.findByRole('heading', { name: /‘편집’ 검색 결과/ }),
    ).toBeInTheDocument()
    expect(search.searches).toHaveLength(2)
  })

  it('본문 없는 429(게이트웨이)와 Retry-After: 0도 호출 제한으로 보고 최소 1초 기다린 뒤 다시 검색한다', async () => {
    const search = mockLectureSearch()
    let limited = true
    server.use(
      http.get('*/api/v1/search/lectures', () => {
        if (!limited) return undefined
        limited = false
        search.searches.push(new URLSearchParams())
        return new HttpResponse(null, {
          status: 429,
          headers: { 'Retry-After': '0' },
        })
      }),
    )
    renderApp(at('편집'), 'GUEST')

    expect(
      await screen.findByText(
        '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('1초 뒤에 다시 검색해요.')).toBeInTheDocument()
    expect(search.searches).toHaveLength(1)

    expect(
      await screen.findByRole('heading', { name: /‘편집’ 검색 결과/ }),
    ).toBeInTheDocument()
    expect(search.searches).toHaveLength(2)
  })

  it('검색할 수 없으면(SEARCH_UNAVAILABLE) 안내하고 전체 강의로 돌아갈 수 있다', async () => {
    mockLectureList()
    const search = mockLectureSearch()
    search.fail('SEARCH_UNAVAILABLE')
    const router = renderApp(at('편집'), 'GUEST')

    expect(
      await screen.findByText(
        '지금은 검색할 수 없어요. 잠시 후 다시 시도해 주세요.',
      ),
    ).toBeInTheDocument()
    // 자동으로 다시 부르지 않는다(검색 서버 장애도 호출 제한에 센다)
    expect(search.searches).toHaveLength(1)

    await userEvent.click(
      screen.getByRole('button', { name: '전체 강의 보기' }),
    )
    expect(
      await screen.findByRole('heading', { name: '전체 강의' }),
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })

  it('회원의 검색 결과 카드는 강의 상세로 이어진다', async () => {
    mockLectureSearch()
    server.use(
      http.get('*/api/v1/lectures/purchased', () =>
        rs({
          content: [],
          page: { size: 100, number: 0, totalElements: 0, totalPages: 0 },
        }),
      ),
    )
    renderApp(at('프리미어'), 'USER')

    expect(
      await screen.findByRole('link', { name: /프리미어 컷편집 입문/ }),
    ).toHaveAttribute('href', '/lectures/11')
  })
})
