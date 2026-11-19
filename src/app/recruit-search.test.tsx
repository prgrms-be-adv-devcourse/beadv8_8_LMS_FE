import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/app/queryClient'
import { renderApp, rs } from '@/test/renderApp'
import { expectFieldError } from '@/test/fieldError'
import {
  manyRecruits,
  mockRecruitSearch,
  SEARCH_RECRUITS,
} from '@/test/recruitSearchMock'
import { server } from '@/test/server'

afterEach(() => {
  queryClient.clear()
})

const TITLES = SEARCH_RECRUITS.map((r) => r.title)

/** 지금 보이는 모집 카드 제목(화면 순서) */
const shownTitles = () =>
  screen
    .queryAllByRole('link')
    .filter((a) => a.getAttribute('href')?.startsWith('/recruits/'))
    .map((a) => TITLES.find((t) => a.textContent?.includes(t)) ?? '')

const expectTitles = (titles: string[]) =>
  waitFor(() => expect(shownTitles()).toEqual(titles))

/** 마지막 요청의 쿼리 */
const lastQuery = (requests: URLSearchParams[]) =>
  Object.fromEntries(requests.at(-1) ?? [])

/** 첫 목록이 그려질 때까지 기다린다 */
const loaded = () => screen.findByRole('link', { name: /토크 게스트/ })

const keywordBox = () => screen.getByRole('searchbox', { name: '검색어' })
const searchParam = (
  router: ReturnType<typeof renderApp>,
  key: string,
): string | null => new URLSearchParams(router.state.location.search).get(key)

describe('출연 모집 검색', () => {
  it('조건이 없으면 요청·URL에 조건을 싣지 않고 모집 중인 글의 수를 보인다', async () => {
    const requests = mockRecruitSearch()
    const router = renderApp('/recruits', 'USER')

    await expectTitles([
      '토크 게스트',
      '롤 내전 게스트 모집',
      '노래 릴레이',
      '주말 공포게임 합방',
      '먹방 콜라보',
    ])
    expect(lastQuery(requests)).toEqual({ page: '0', size: '10' })
    expect(router.state.location.search).toBe('')
    expect(
      screen.getByRole('heading', { name: '모집 중인 글' }),
    ).toBeInTheDocument()
    expect(screen.getByText('5개')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '적용한 조건' })).toBeNull()
  })

  it('검색어는 입력만으로 부르지 않고 Enter로 앞뒤 공백을 지워 보낸다', async () => {
    const requests = mockRecruitSearch()
    const router = renderApp('/recruits', 'USER')
    await loaded()
    const before = requests.length

    await userEvent.type(keywordBox(), '  롤 ')
    expect(requests).toHaveLength(before)
    expect(router.state.location.search).toBe('')

    await userEvent.type(keywordBox(), '{Enter}')
    // 제목·본문에서 찾는다
    await expectTitles(['롤 내전 게스트 모집', '노래 릴레이'])
    expect(lastQuery(requests)).toEqual({
      keyword: '롤',
      page: '0',
      size: '10',
    })
    expect(searchParam(router, 'keyword')).toBe('롤')
    expect(screen.getByRole('heading', { name: '검색 결과' })).toBeVisible()
    expect(screen.getByText('2개')).toBeInTheDocument()
    const chips = screen.getByRole('list', { name: '적용한 조건' })
    expect(
      within(chips).getByRole('button', { name: '검색어 롤 조건 지우기' }),
    ).toBeInTheDocument()
  })

  it('검색어는 호스트 닉네임에서도 찾는다', async () => {
    const requests = mockRecruitSearch()
    renderApp('/recruits', 'USER')
    await loaded()

    await userEvent.type(keywordBox(), '고래{Enter}')

    await expectTitles(['토크 게스트', '노래 릴레이', '주말 공포게임 합방'])
    expect(lastQuery(requests)).toMatchObject({ keyword: '고래' })
  })

  it('방송 날짜·출연료 범위는 조건 적용으로 함께 보내고 칩으로 보인다', async () => {
    const requests = mockRecruitSearch()
    const router = renderApp('/recruits', 'USER')
    await loaded()

    fireEvent.change(screen.getByLabelText('방송 날짜 시작'), {
      target: { value: '2999-10-20' },
    })
    fireEvent.change(screen.getByLabelText('방송 날짜 끝'), {
      target: { value: '2999-10-22' },
    })
    await userEvent.type(
      screen.getByRole('textbox', { name: '최소 출연료 (HP)' }),
      '25000',
    )
    await userEvent.type(
      screen.getByRole('textbox', { name: '최대 출연료 (HP)' }),
      '5만0000',
    )
    await userEvent.click(screen.getByRole('button', { name: '조건 적용' }))

    await expectTitles(['토크 게스트', '주말 공포게임 합방'])
    expect(lastQuery(requests)).toEqual({
      scheduledFrom: '2999-10-20',
      scheduledTo: '2999-10-22',
      minFee: '25000',
      maxFee: '50000',
      page: '0',
      size: '10',
    })
    expect(router.state.location.search).toBe(
      '?scheduledFrom=2999-10-20&scheduledTo=2999-10-22&minFee=25000&maxFee=50000',
    )
    const chips = screen.getByRole('list', { name: '적용한 조건' })
    expect(
      within(chips).getByRole('button', {
        name: /^방송 2999년 10\/20\(.\) ~ 2999년 10\/22\(.\) 조건 지우기$/,
      }),
    ).toBeInTheDocument()
    expect(
      within(chips).getByRole('button', {
        name: '출연료 25,000 ~ 50,000 HP 조건 지우기',
      }),
    ).toBeInTheDocument()
  })

  it('남은 자리·정렬은 고르는 즉시 반영하고 기본 정렬은 URL·요청에서 뺀다', async () => {
    const requests = mockRecruitSearch()
    const router = renderApp('/recruits', 'USER')
    await loaded()

    await userEvent.click(
      screen.getByRole('checkbox', { name: '남은 자리 있는 글만' }),
    )
    await expectTitles(['노래 릴레이', '주말 공포게임 합방', '먹방 콜라보'])
    expect(router.state.location.search).toBe('?hasSeats=true')
    expect(lastQuery(requests)).toMatchObject({ hasSeats: 'true' })

    const sort = screen.getByRole('combobox', { name: '정렬' })
    await userEvent.selectOptions(sort, '출연료 높은 순')
    await expectTitles(['먹방 콜라보', '주말 공포게임 합방', '노래 릴레이'])
    expect(router.state.location.search).toBe('?hasSeats=true&sort=FEE_HIGH')
    expect(lastQuery(requests)).toEqual({
      hasSeats: 'true',
      sort: 'FEE_HIGH',
      page: '0',
      size: '10',
    })

    await userEvent.selectOptions(sort, '마감 임박순')
    await expectTitles(['주말 공포게임 합방', '노래 릴레이', '먹방 콜라보'])
    await userEvent.selectOptions(sort, '방송 임박순')
    // 마감 임박순과 순서가 같아 목록만으로는 새 결과인지 알 수 없으니 요청부터 기다린다
    await waitFor(() =>
      expect(lastQuery(requests)).toMatchObject({ sort: 'SCHEDULED_SOON' }),
    )
    await expectTitles(['주말 공포게임 합방', '노래 릴레이', '먹방 콜라보'])

    await userEvent.selectOptions(sort, '최신순')
    await waitFor(() =>
      expect(router.state.location.search).toBe('?hasSeats=true'),
    )
    await waitFor(() =>
      expect(lastQuery(requests)).toEqual({
        hasSeats: 'true',
        page: '0',
        size: '10',
      }),
    )
  })

  it('조건이 바뀌면 첫 쪽으로 간다', async () => {
    const requests = mockRecruitSearch(manyRecruits(12))
    const router = renderApp('/recruits?page=2', 'USER')
    expect(await screen.findByText('모집 12')).toBeInTheDocument()
    expect(lastQuery(requests)).toMatchObject({ page: '1' })

    await userEvent.type(keywordBox(), '모집 1{Enter}')

    expect(await screen.findByText('모집 1')).toBeInTheDocument()
    await waitFor(() => expect(searchParam(router, 'page')).toBeNull())
    expect(searchParam(router, 'keyword')).toBe('모집 1')
    expect(lastQuery(requests)).toMatchObject({ keyword: '모집 1', page: '0' })
    expect(screen.getByText('4개')).toBeInTheDocument()
  })

  it('범위가 뒤집히면 보내지 않고 칸에서 알린다', async () => {
    const requests = mockRecruitSearch()
    const router = renderApp('/recruits', 'USER')
    await loaded()
    const before = requests.length

    fireEvent.change(screen.getByLabelText('방송 날짜 시작'), {
      target: { value: '2999-10-25' },
    })
    const to = screen.getByLabelText('방송 날짜 끝')
    fireEvent.change(to, { target: { value: '2999-10-20' } })
    await userEvent.type(
      screen.getByRole('textbox', { name: '최소 출연료 (HP)' }),
      '50000',
    )
    const maxFee = screen.getByRole('textbox', { name: '최대 출연료 (HP)' })
    await userEvent.type(maxFee, '10000')
    await userEvent.click(screen.getByRole('button', { name: '검색' }))

    expectFieldError(to, '끝 날짜는 시작 날짜와 같거나 뒤여야 해요.')
    await waitFor(() => expect(to).toHaveFocus())
    expect(requests).toHaveLength(before)
    expect(router.state.location.search).toBe('')

    // 날짜를 고치면 다음 오류 칸(출연료)을 알린다
    fireEvent.change(to, { target: { value: '2999-10-30' } })
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    expectFieldError(maxFee, '최대 출연료는 최소 출연료와 같거나 커야 해요.')
    expect(requests).toHaveLength(before)
  })

  it('BE가 400이면 안내하고 조건을 지울 수 있다', async () => {
    const requests = mockRecruitSearch()
    const router = renderApp('/recruits?minFee=50000&maxFee=10000', 'USER')

    expect(
      await screen.findByText('검색 조건을 확인해 주세요'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('출연료 범위가 올바르지 않습니다.'),
    ).toBeInTheDocument()
    expect(lastQuery(requests)).toMatchObject({
      minFee: '50000',
      maxFee: '10000',
    })

    await userEvent.click(screen.getByRole('button', { name: '조건 지우기' }))
    await expectTitles([
      '토크 게스트',
      '롤 내전 게스트 모집',
      '노래 릴레이',
      '주말 공포게임 합방',
      '먹방 콜라보',
    ])
    expect(router.state.location.search).toBe('')
  })

  it('주소의 형식이 틀린 값은 그 조건만 버린다', async () => {
    const requests = mockRecruitSearch()
    renderApp(
      '/recruits?sort=WRONG&minFee=-5&scheduledFrom=2999-02-30&hasSeats=yes&keyword=%20%20',
      'USER',
    )

    await loaded()
    expect(lastQuery(requests)).toEqual({ page: '0', size: '10' })
  })

  it('주소의 날짜가 달력에 없으면(달·일 범위 밖) 화면이 깨지지 않고 그 조건만 버린다', async () => {
    const requests = mockRecruitSearch()
    renderApp(
      '/recruits?scheduledFrom=2026-13-01&scheduledTo=2026-01-32',
      'USER',
    )

    await loaded()
    expect(lastQuery(requests)).toEqual({ page: '0', size: '10' })
    expect(screen.getByLabelText('방송 날짜 시작')).toHaveValue('')
    expect(screen.queryByRole('list', { name: '적용한 조건' })).toBeNull()
  })

  it('결과가 없으면 조건을 바꾸라고 안내하고, 조건 지우기는 정렬을 남긴다', async () => {
    mockRecruitSearch()
    const router = renderApp('/recruits?keyword=zzz&sort=FEE_HIGH', 'USER')

    expect(
      await screen.findByText('조건에 맞는 모집글이 없어요'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '조건 지우기' }))

    await expectTitles([
      '먹방 콜라보',
      '롤 내전 게스트 모집',
      '주말 공포게임 합방',
      '토크 게스트',
      '노래 릴레이',
    ])
    expect(router.state.location.search).toBe('?sort=FEE_HIGH')
    expect(keywordBox()).toHaveValue('')
  })

  it('칩을 하나씩 지우면 다음 칩으로, 모두 지우면 검색어 칸으로 포커스가 간다', async () => {
    mockRecruitSearch()
    const router = renderApp(
      '/recruits?keyword=%EB%A1%A4&minFee=30000&hasSeats=true',
      'USER',
    )
    expect(
      await screen.findByText('조건에 맞는 모집글이 없어요'),
    ).toBeInTheDocument()
    const chips = screen.getByRole('list', { name: '적용한 조건' })

    await userEvent.click(
      within(chips).getByRole('button', {
        name: '출연료 30,000 HP 이상 조건 지우기',
      }),
    )
    await expectTitles(['노래 릴레이'])
    expect(router.state.location.search).toBe(
      `?keyword=${encodeURIComponent('롤')}&hasSeats=true`,
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '남은 자리 있음 조건 지우기' }),
      ).toHaveFocus(),
    )
    expect(
      screen.getByRole('textbox', { name: '최소 출연료 (HP)' }),
    ).toHaveValue('')

    await userEvent.click(
      screen.getByRole('button', { name: '조건 모두 지우기' }),
    )
    await waitFor(() => expect(router.state.location.search).toBe(''))
    await waitFor(() => expect(keywordBox()).toHaveFocus())
    expect(keywordBox()).toHaveValue('')
    expect(
      screen.getByRole('checkbox', { name: '남은 자리 있는 글만' }),
    ).not.toBeChecked()
  })

  it('좁은 화면용 펼치기 버튼은 걸린 조건 수(검색어 제외)를 알리고 조건 칸을 여닫는다', async () => {
    mockRecruitSearch()
    renderApp('/recruits?keyword=%EB%A1%A4&minFee=30000&hasSeats=true', 'USER')

    const toggle = await screen.findByRole('button', {
      name: '조건 2개 적용됨',
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const panel = document.getElementById(
      toggle.getAttribute('aria-controls') ?? '',
    )
    expect(panel).toContainElement(
      screen.getByRole('checkbox', { name: '남은 자리 있는 글만' }),
    )

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('내 모집글 탭에는 검색 막대가 없고 조건을 보내지 않는다', async () => {
    const mine: URLSearchParams[] = []
    server.use(
      http.get('*/api/v1/appearances/recruits/mine', ({ request }) => {
        mine.push(new URL(request.url).searchParams)
        return rs({
          content: [],
          page: { size: 10, number: 0, totalElements: 0, totalPages: 0 },
        })
      }),
    )
    renderApp(
      '/recruits?tab=mine&keyword=%EB%A1%A4&sort=FEE_HIGH',
      'INFLUENCER',
    )

    expect(
      await screen.findByText('아직 올린 모집글이 없어요'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('search')).toBeNull()
    expect(lastQuery(mine)).not.toHaveProperty('keyword')
    expect(lastQuery(mine)).not.toHaveProperty('sort')
  })
})
