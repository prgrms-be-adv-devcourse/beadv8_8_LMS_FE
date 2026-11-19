import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import {
  mockInfluencerSearch,
  mockInfluencerSuggestions,
} from '@/test/influencerSearchMock'
import {
  mockLectureSearch,
  mockLectureSuggestions,
} from '@/test/lectureSearchMock'
import { renderApp, rs } from '@/test/renderApp'
import { server } from '@/test/server'

afterEach(() => queryClient.clear())

/** 인플루언서 화면의 기본 목록(조건 없을 때) */
function mockInfluencerList() {
  server.use(
    http.get('*/api/v1/members/influencers', () =>
      rs({
        content: [],
        page: { size: 12, number: 0, totalElements: 0, totalPages: 0 },
      }),
    ),
  )
}

const lectureBox = () => screen.getByRole('combobox', { name: '강의 검색' })
const lectureList = () =>
  screen.queryByRole('listbox', { name: '강의 검색어 추천' })
const influencerBox = () =>
  screen.getByRole('combobox', { name: '인플루언서 검색' })
/** 강의 후보(정렬 select의 option은 빼고 후보 목록 안만) */
const options = () => {
  const list = lectureList()
  return list ? within(list).getAllByRole('option') : []
}
/** 후보 목록이 열릴 때까지 기다려 후보를 돌려준다 */
const findOptions = async (name = '강의 검색어 추천') =>
  within(await screen.findByRole('listbox', { name })).getAllByRole('option')
/** 강의 후보 하나(후보 목록 안) */
const findOption = async (name: RegExp) =>
  within(
    await screen.findByRole('listbox', { name: '강의 검색어 추천' }),
  ).findByRole('option', { name })

/** debounce(300ms)보다 넉넉히 기다린다 */
const pause = (ms = 450) => new Promise((resolve) => setTimeout(resolve, ms))

/** 회원 강의 화면이 부르는 구매 목록(보유 표시용) */
function mockPurchased() {
  server.use(
    http.get('*/api/v1/lectures/purchased', () =>
      rs({
        content: [],
        page: { size: 100, number: 0, totalElements: 0, totalPages: 0 },
      }),
    ),
  )
}

describe('강의 검색어 자동완성', () => {
  it('입력을 멈추면 한 번만 부르고 후보에 판매자 닉네임을 함께 보인다. 다른 검색어를 치는 동안 이전 후보는 숨긴다', async () => {
    mockLectureSearch()
    const suggestions = mockLectureSuggestions()
    renderApp('/lectures', 'GUEST')
    await screen.findByRole('combobox', { name: '강의 검색' })

    await userEvent.type(lectureBox(), '  프리미어 ')
    const list = await screen.findByRole('listbox', {
      name: '강의 검색어 추천',
    })
    expect(within(list).getAllByRole('option')).toHaveLength(2)
    expect(
      within(list).getByRole('option', { name: /프리미어 컷편집 입문/ }),
    ).toHaveTextContent('배그고수')
    expect(lectureBox()).toHaveAttribute('aria-expanded', 'true')
    // 글자마다 부르지 않고, 앞뒤 공백을 정리해 보낸다
    expect(suggestions.requests).toHaveLength(1)
    expect(suggestions.requests[0].get('keyword')).toBe('프리미어')

    // 이어서 치면 그 검색어의 응답이 오기 전까지 이전 후보를 보이지 않는다
    await userEvent.type(lectureBox(), '자')
    // 느린 CI에서는 입력 직후 한 번 더 그려진 뒤에 숨는다. 새 응답(300ms 뒤)이 오기 전에 숨는지를 기다려 본다
    await waitFor(() => expect(options()).toHaveLength(0))
    expect(lectureBox()).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() =>
      expect(suggestions.requests.at(-1)?.get('keyword')).toBe('프리미어 자'),
    )
    expect(await findOption(/프리미어 자막 & 효과/)).toBeInTheDocument()
    expect(options()).toHaveLength(1)
  })

  it('공백만 입력하면 부르지 않는다', async () => {
    mockLectureSearch()
    const suggestions = mockLectureSuggestions()
    renderApp('/lectures', 'GUEST')
    await screen.findByRole('combobox', { name: '강의 검색' })

    await userEvent.type(lectureBox(), '   ')
    await pause()
    expect(suggestions.requests).toHaveLength(0)
    expect(lectureList()).toBeNull()
  })

  it('입력을 줄여도 멈추기 전에는 받아 둔 이전 검색어의 후보를 보이지 않는다', async () => {
    mockLectureSearch()
    const suggestions = mockLectureSuggestions()
    renderApp('/lectures', 'GUEST')
    await screen.findByRole('combobox', { name: '강의 검색' })

    await userEvent.type(lectureBox(), '방송 장')
    expect(await findOption(/방송 장비 가이드/)).toBeInTheDocument()

    // '방'으로 줄이면 멈춘 검색어는 아직 '방송 장'이다. 그 후보(캐시)를 '방'의 후보처럼 보이지 않는다
    await userEvent.type(lectureBox(), '{Backspace}{Backspace}{Backspace}')
    expect(lectureBox()).toHaveValue('방')
    expect(options()).toHaveLength(0)
    expect(lectureBox()).toHaveAttribute('aria-expanded', 'false')

    // 멈추면 '방'의 후보로 바뀐다
    await waitFor(() => expect(options()).toHaveLength(5))
    expect(suggestions.requests.at(-1)?.get('keyword')).toBe('방')
  })

  it('판매자 닉네임을 모르는 후보는 제목만 보인다', async () => {
    mockLectureSearch()
    mockLectureSuggestions()
    renderApp('/lectures', 'GUEST')
    await screen.findByRole('combobox', { name: '강의 검색' })

    await userEvent.type(lectureBox(), '방송 장')
    // 시험 강의 16은 sellerNickname이 null이다
    const option = await findOption(/방송 장비 가이드/)
    expect(option.textContent).toBe('방송 장비 가이드')
    expect(option.children).toHaveLength(1)
  })

  it('늦게 온 앞 검색어의 응답이 다른 검색어의 후보를 덮지 않는다', async () => {
    mockLectureSearch()
    const suggestions = mockLectureSuggestions()
    const release = suggestions.hold('방')
    renderApp('/lectures', 'GUEST')
    await screen.findByRole('combobox', { name: '강의 검색' })

    await userEvent.type(lectureBox(), '방')
    await waitFor(() => expect(suggestions.requests).toHaveLength(1))
    await userEvent.type(lectureBox(), '송 장')
    expect(await findOption(/방송 장비 가이드/)).toBeInTheDocument()

    // '방'의 후보 5개('토크 방송 진행' 등)가 이제 와도 쓰지 않는다
    release()
    await pause(100)
    expect(options()).toHaveLength(1)
    expect(options()[0]).toHaveTextContent('방송 장비 가이드')
  })

  it('화살표로 후보를 옮기고 Enter로 고른다. 회원은 강의 상세로 간다', async () => {
    mockPurchased()
    mockLectureSearch()
    mockLectureSuggestions()
    const router = renderApp('/lectures', 'USER')
    await screen.findByRole('combobox', { name: '강의 검색' })

    await userEvent.type(lectureBox(), '프리미어')
    const [first, second] = await findOptions()
    expect(lectureBox()).not.toHaveAttribute('aria-activedescendant')

    await userEvent.keyboard('{ArrowDown}')
    expect(lectureBox()).toHaveAttribute('aria-activedescendant', first.id)
    expect(first).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowDown}')
    expect(lectureBox()).toHaveAttribute('aria-activedescendant', second.id)
    // 끝에서 다시 처음으로
    await userEvent.keyboard('{ArrowDown}')
    expect(lectureBox()).toHaveAttribute('aria-activedescendant', first.id)
    await userEvent.keyboard('{ArrowUp}')
    expect(lectureBox()).toHaveAttribute('aria-activedescendant', second.id)
    expect(second).toHaveTextContent('프리미어 자막 & 효과')

    await userEvent.keyboard('{Enter}')
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/lectures/12'),
    )
  })

  it('Esc와 칸 밖 누르기는 목록만 닫고 입력값은 둔다', async () => {
    mockLectureSearch()
    mockLectureSuggestions()
    renderApp('/lectures', 'GUEST')
    await screen.findByRole('combobox', { name: '강의 검색' })

    await userEvent.type(lectureBox(), '프리미어')
    await findOptions()
    await userEvent.keyboard('{ArrowDown}{Escape}')
    expect(lectureList()).toBeNull()
    expect(lectureBox()).toHaveAttribute('aria-expanded', 'false')
    expect(lectureBox()).not.toHaveAttribute('aria-activedescendant')
    expect(lectureBox()).toHaveValue('프리미어')

    // 화살표로 다시 연다
    await userEvent.keyboard('{ArrowDown}')
    expect(await findOptions()).toHaveLength(2)
    await userEvent.click(document.body)
    expect(lectureList()).toBeNull()
    expect(lectureBox()).toHaveValue('프리미어')
  })

  it('회원이 후보를 누르면 강의 상세로 간다', async () => {
    mockPurchased()
    mockLectureSearch()
    mockLectureSuggestions()
    const router = renderApp('/lectures', 'USER')
    await screen.findByRole('combobox', { name: '강의 검색' })

    await userEvent.type(lectureBox(), '프리미어')
    await userEvent.click(await findOption(/프리미어 컷편집 입문/))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/lectures/11'),
    )
  })

  it.each([
    ['429', 'TOO_MANY_REQUESTS'],
    ['503', 'SEARCH_UNAVAILABLE'],
  ] as const)(
    '%s이면 오류 없이 후보만 숨기고 Enter 검색은 그대로 된다',
    async (_, code) => {
      const search = mockLectureSearch()
      const suggestions = mockLectureSuggestions()
      suggestions.fail(code)
      const router = renderApp('/lectures', 'GUEST')
      await screen.findByRole('combobox', { name: '강의 검색' })

      await userEvent.type(lectureBox(), '편집')
      await waitFor(() => expect(suggestions.requests).toHaveLength(1))
      await pause(100)
      expect(lectureList()).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(
        screen.queryByText(/요청이 너무 많아요|검색할 수 없어요/),
      ).toBeNull()
      // 다시 부르지 않는다
      expect(suggestions.requests).toHaveLength(1)

      await userEvent.keyboard('{Enter}')
      expect(
        await screen.findByRole('heading', { name: /‘편집’ 검색 결과/ }),
      ).toBeInTheDocument()
      expect(search.searches.at(-1)?.get('keyword')).toBe('편집')
      expect(router.state.location.search).toBe(
        `?keyword=${encodeURIComponent('편집')}`,
      )
    },
  )

  it('초성만 치면 초성으로 찾은 후보를 보인다', async () => {
    mockLectureSearch()
    const suggestions = mockLectureSuggestions()
    renderApp('/lectures', 'GUEST')
    await screen.findByRole('combobox', { name: '강의 검색' })

    await userEvent.type(lectureBox(), 'ㅂㅅ')
    expect(await findOption(/방송 장비 가이드/)).toBeInTheDocument()
    // 초성 낱말 앞부분으로 걸린 후보도 리뷰 많은 순으로 5개까지
    expect(options()).toHaveLength(5)
    expect(options()[0]).toHaveTextContent('방송 장비 가이드')
    expect(options()[1]).toHaveTextContent('토크 방송 진행')
    expect(suggestions.requests.at(-1)?.get('keyword')).toBe('ㅂㅅ')
  })
})

describe('초성 검색 결과', () => {
  it('highlights 칸이 모두 비어 있으면 강조 없이 원래 제목·판매자를 보인다', async () => {
    const search = mockLectureSearch()
    renderApp(`/lectures?keyword=${encodeURIComponent('ㅍㄹㅁㅇ')}`, 'GUEST')

    const card = await screen.findByRole('button', {
      name: /프리미어 컷편집 입문/,
    })
    // CI에서 앞 테스트(초성 'ㅂㅅ' 입력)의 늦은 검색 요청이 이 흉내에 먼저 잡힌 적이 있어, 첫 요청이 아니라 이 화면의 요청을 찾는다
    expect(search.searches.map((p) => p.get('keyword'))).toContain('ㅍㄹㅁㅇ')
    expect(card).toHaveTextContent('프리미어 컷편집 입문')
    expect(card).toHaveTextContent('배그고수')
    expect(card.querySelector('em')).toBeNull()
    expect(card).not.toHaveTextContent('강의 내용:')
    expect(
      screen.getByRole('heading', { name: /‘ㅍㄹㅁㅇ’ 검색 결과/ }),
    ).toHaveTextContent('2개')
  })
})

describe('인플루언서 검색어 자동완성', () => {
  it('입력을 멈추면 한 번만 부르고, 후보를 누르면 그 프로필로 간다', async () => {
    mockInfluencerList()
    mockInfluencerSearch()
    const suggestions = mockInfluencerSuggestions()
    const router = renderApp('/influencers', 'USER')
    await screen.findByRole('combobox', { name: '인플루언서 검색' })

    await userEvent.type(influencerBox(), '메이플')
    const list = await screen.findByRole('listbox', {
      name: '인플루언서 검색어 추천',
    })
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['메이플고수', '메이플 뉴비'])
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].get('keyword')).toBe('메이플')

    await userEvent.click(
      within(list).getByRole('option', { name: '메이플 뉴비' }),
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/influencers/121'),
    )
  })

  it('Enter로 고른 후보의 프로필로 간다', async () => {
    mockInfluencerList()
    mockInfluencerSearch()
    mockInfluencerSuggestions()
    const router = renderApp('/influencers', 'USER')
    await screen.findByRole('combobox', { name: '인플루언서 검색' })

    await userEvent.type(influencerBox(), '메이플')
    await findOptions('인플루언서 검색어 추천')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/influencers/101'),
    )
  })

  it('503이면 오류 없이 후보만 숨기고 Enter 검색은 그대로 된다', async () => {
    mockInfluencerList()
    const search = mockInfluencerSearch()
    const suggestions = mockInfluencerSuggestions({ unavailable: true })
    const router = renderApp('/influencers', 'USER')
    await screen.findByRole('combobox', { name: '인플루언서 검색' })

    await userEvent.type(influencerBox(), '메이플')
    await waitFor(() => expect(suggestions).toHaveLength(1))
    await pause(100)
    expect(
      screen.queryByRole('listbox', { name: '인플루언서 검색어 추천' }),
    ).toBeNull()
    expect(screen.queryByText(/검색할 수 없어요/)).toBeNull()

    await userEvent.keyboard('{Enter}')
    await waitFor(() =>
      expect(router.state.location.search).toBe(
        `?keyword=${encodeURIComponent('메이플')}`,
      ),
    )
    expect(search.at(-1)?.get('keyword')).toBe('메이플')
    expect(router.state.location.pathname).toBe('/influencers')
  })

  it('본 검색보다 긴 50자 넘는 검색어는 50자로 잘라 부른다', async () => {
    mockInfluencerList()
    mockInfluencerSearch()
    const suggestions = mockInfluencerSuggestions()
    renderApp('/influencers', 'USER')
    await screen.findByRole('combobox', { name: '인플루언서 검색' })

    await userEvent.click(influencerBox())
    await userEvent.paste('가'.repeat(60))
    await waitFor(() => expect(suggestions).toHaveLength(1))
    expect(suggestions[0].get('keyword')).toBe('가'.repeat(50))
  })
})
