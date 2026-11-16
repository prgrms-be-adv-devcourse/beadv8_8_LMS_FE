import { http } from 'msw'
import type { InfluencerSearchItem } from '@/entities/member/search'
import type { Me } from '@/shared/auth/me'
import type { PagedModel } from '@/shared/api/types'
import { categoriesOf, CONTENT_CATEGORIES } from './contentCategories'
import { problem } from './emailCodeMock'
import { rs } from './renderApp'
import { server } from './server'

/**
 * 테스트 전용: 콘텐츠 분야·자기소개(내 정보 수정), 프로필 사진 일괄 조회, 인플루언서 검색을 BE처럼 흉내 내는 MSW 핸들러.
 * 개발 서버에서는 쓰지 않는다(실제 BE를 쓴다).
 */

const isInfluencer = (role: string) =>
  role === 'INFLUENCER' || role === 'VERIFIED_INFLUENCER'

/**
 * 내 정보 수정(PATCH /members/me). 6개 이상·중복·없는 code·101자는 각 400 code, 인플루언서가 아닌데 새로 넣거나
 * 바꾸면 403 INFLUENCER_PROFILE_NOT_ALLOWED(아무것도 바뀌지 않음). 정상은 보낸 순서 그대로 저장해 돌려준다.
 * 받은 요청 본문을 차례로 남긴다
 */
export function mockUpdateMe(initial: Me) {
  const state = { me: initial, bodies: [] as Record<string, unknown>[] }
  server.use(
    http.patch('*/api/v1/members/me', async ({ request }) => {
      const body = (await request.json()) as {
        nickname?: string | null
        contentCategories?: string[] | null
        bio?: string | null
      }
      state.bodies.push(body)
      const current = state.me
      const currentCodes = current.contentCategories.map((c) => c.code)
      const codes = body.contentCategories ?? null
      if (codes) {
        if (codes.length > 5)
          return problem(
            400,
            'INVALID_CONTENT_CATEGORY_COUNT',
            '콘텐츠 분야는 5개까지 고를 수 있어요.',
          )
        if (new Set(codes).size !== codes.length)
          return problem(
            400,
            'DUPLICATE_CONTENT_CATEGORY',
            '같은 콘텐츠 분야를 두 번 고를 수 없어요.',
          )
      }
      const bio = body.bio == null ? null : body.bio.trim()
      if (bio !== null && bio.length > 100)
        return problem(
          400,
          'INVALID_BIO_LENGTH',
          '자기소개는 100자 이하로 입력해 주세요.',
        )
      const setsCategories =
        codes !== null &&
        codes.length > 0 &&
        codes.join(',') !== currentCodes.join(',')
      const setsBio = bio !== null && bio !== '' && bio !== current.bio
      if ((setsCategories || setsBio) && !isInfluencer(current.role))
        return problem(
          403,
          'INFLUENCER_PROFILE_NOT_ALLOWED',
          '콘텐츠 분야와 자기소개는 인플루언서만 설정할 수 있어요.',
        )
      if (
        codes?.some(
          (code) =>
            !currentCodes.includes(code) &&
            !CONTENT_CATEGORIES.some((c) => c.code === code),
        )
      )
        return problem(
          400,
          'INVALID_CONTENT_CATEGORY',
          '고를 수 없는 콘텐츠 분야예요.',
        )
      state.me = {
        ...current,
        nickname: body.nickname ?? current.nickname,
        contentCategories: codes
          ? codes.map(
              (code) =>
                current.contentCategories.find((c) => c.code === code) ??
                categoriesOf(code)[0],
            )
          : current.contentCategories,
        bio: bio === null ? current.bio : bio || null,
      }
      return rs(state.me)
    }),
  )
  return state
}

/** 사진이 있는 회원의 사진 주소 */
export const photoUrl = (id: number) => `https://img.test/profile/${id}.png`
/** 처음 일괄 조회에서 주는 깨진 주소 */
export const brokenPhotoUrl = (id: number) =>
  `https://img.test/expired/${id}.png`

/**
 * 프로필 사진 일괄 조회(GET /members/profile-images?ids=). noPhoto의 회원은 null이다.
 * broken의 회원은 처음(여러 명을 한 번에 물을 때) 깨진 주소를 주고, 그 회원만 다시 물으면 정상 주소를 준다.
 * 받은 ids 값을 차례로 남긴다
 */
export function mockProfileImages({
  noPhoto = [],
  broken = [],
}: { noPhoto?: number[]; broken?: number[] } = {}) {
  const requests: string[] = []
  server.use(
    http.get('*/api/v1/members/profile-images', ({ request }) => {
      const raw = new URL(request.url).searchParams.get('ids') ?? ''
      requests.push(raw)
      const ids = raw.split(',').map(Number)
      if (ids.length === 0 || ids.length > 100)
        return problem(400, 'INVALID_REQUEST', 'ids는 1~100개여야 합니다.')
      const single = ids.length === 1
      return rs(
        Object.fromEntries(
          ids.map((id) => [
            String(id),
            noPhoto.includes(id)
              ? null
              : broken.includes(id) && !single
                ? brokenPhotoUrl(id)
                : photoUrl(id),
          ]),
        ),
      )
    }),
  )
  return requests
}

const member = (
  id: number,
  nickname: string,
  role: 'INFLUENCER' | 'VERIFIED_INFLUENCER',
  codes: string[],
  channelName: string | null,
  followerCount: number,
  rating: [average: number, count: number] | null,
  bio: string | null = null,
): InfluencerSearchItem => ({
  id,
  nickname,
  role,
  contentCategories: categoriesOf(...codes),
  bio,
  channelName,
  followerCount,
  appearanceRating: rating
    ? { average: rating[0], count: rating[1] }
    : { average: null, count: 0 },
})

/** 검색 시험 회원 25명(분야·인증·팔로워·평점·채널 없음·리뷰 없음을 섞었다) */
export const SEARCH_MEMBERS: InfluencerSearchItem[] = [
  member(
    101,
    '메이플고수',
    'VERIFIED_INFLUENCER',
    ['MAPLESTORY', 'GAME'],
    '메이플고수TV',
    15200,
    [4.5, 12],
    '메이플 방송 5년차입니다.',
  ),
  member(
    102,
    '롤하는 수달',
    'INFLUENCER',
    ['LEAGUE_OF_LEGENDS', 'GAME', 'JUST_CHATTING', 'VALORANT', 'OVERWATCH'],
    '수달 게임방',
    8300,
    [4.8, 30],
    '롤 다이아 티어, 발로란트도 해요.',
  ),
  member(
    103,
    '먹방하는 곰',
    'VERIFIED_INFLUENCER',
    ['MUKBANG', 'COOKING'],
    '곰 먹방',
    120000,
    [4.2, 54],
  ),
  member(
    104,
    '새벽기타',
    'INFLUENCER',
    ['MUSIC', 'INSTRUMENT', 'SINGING'],
    '새벽기타 라이브',
    1840,
    [5.0, 1],
    '통기타 들고 새벽에 노래하는 방송이에요.',
  ),
  member(105, '채널없는 새내기', 'INFLUENCER', ['DAILY_LIFE'], null, 0, null),
  member(
    106,
    '리뷰없는 여행자',
    'INFLUENCER',
    ['TRAVEL', 'DAILY_LIFE'],
    '떠나는 채널',
    950,
    null,
    '세계 여행 브이로그',
  ),
  member(
    107,
    '배그 장인',
    'VERIFIED_INFLUENCER',
    ['BATTLEGROUNDS', 'GAME'],
    '배그장인',
    45000,
    [3.9, 20],
  ),
  member(
    108,
    '그림 그리는 참새',
    'INFLUENCER',
    ['DRAWING'],
    '참새 화실',
    3200,
    [4.6, 8],
  ),
  member(
    109,
    '축구 해설가',
    'VERIFIED_INFLUENCER',
    ['SPORTS', 'FC_ONLINE'],
    '해설 채널',
    230000,
    [4.1, 40],
  ),
  member(
    110,
    '뷰티 언니',
    'INFLUENCER',
    ['BEAUTY'],
    '언니 뷰티',
    15000,
    [4.4, 15],
  ),
  member(
    111,
    '공부방 선생',
    'VERIFIED_INFLUENCER',
    ['EDUCATION'],
    '공부방',
    6100,
    [4.9, 22],
  ),
  member(
    112,
    '스타 고인물',
    'INFLUENCER',
    ['STARCRAFT', 'GAME'],
    '스타 고인물',
    2700,
    [3.2, 6],
  ),
  member(
    113,
    '던파 모험가',
    'INFLUENCER',
    ['DUNGEON_FIGHTER', 'GAME'],
    '던파 채널',
    1200,
    [2.8, 4],
  ),
  member(
    114,
    '마크 건축가',
    'INFLUENCER',
    ['MINECRAFT'],
    '마크 건축',
    9800,
    [4.0, 9],
  ),
  member(
    115,
    '로아 원정대',
    'VERIFIED_INFLUENCER',
    ['LOST_ARK', 'GAME'],
    '로아 원정대',
    31000,
    [4.3, 11],
  ),
  member(116, '옵치 탱커', 'INFLUENCER', ['OVERWATCH'], '탱커 채널', 700, null),
  member(
    117,
    '요리하는 고래',
    'INFLUENCER',
    ['COOKING', 'MUKBANG'],
    '고래 부엌',
    5400,
    [4.7, 3],
  ),
  member(
    118,
    '노래하는 새',
    'VERIFIED_INFLUENCER',
    ['SINGING', 'MUSIC'],
    '새 노래방',
    88000,
    [4.6, 25],
  ),
  member(
    119,
    '발로 에이스',
    'INFLUENCER',
    ['VALORANT'],
    '에이스',
    400,
    [3.5, 2],
  ),
  member(
    120,
    '수다쟁이',
    'INFLUENCER',
    ['JUST_CHATTING', 'DAILY_LIFE'],
    '수다방',
    12000,
    [4.1, 7],
  ),
  member(
    121,
    '메이플 뉴비',
    'INFLUENCER',
    ['MAPLESTORY'],
    null,
    0,
    null,
    '메이플 시작한 지 한 달',
  ),
  member(
    122,
    '분야 없는 인플루언서',
    'INFLUENCER',
    [],
    '그냥 채널',
    300,
    [4.0, 1],
  ),
  member(
    123,
    '캠핑 여행가',
    'VERIFIED_INFLUENCER',
    ['TRAVEL'],
    '캠핑 여행',
    64000,
    [4.8, 18],
  ),
  member(
    124,
    '게임 종합',
    'INFLUENCER',
    ['GAME', 'MAPLESTORY', 'LEAGUE_OF_LEGENDS'],
    '게임 종합 채널',
    20000,
    [4.2, 10],
  ),
  member(
    125,
    '악기 연주가',
    'INFLUENCER',
    ['INSTRUMENT'],
    '연주실',
    1100,
    [4.9, 2],
  ),
]

/** 줄임말 몇 개(BE는 동의어 사전으로 더 많이 찾는다) */
const SYNONYMS: Record<string, string> = {
  롤: '리그 오브 레전드',
  배그: '배틀그라운드',
  로아: '로스트아크',
  옵치: '오버워치',
}

function matches(item: InfluencerSearchItem, keyword: string) {
  const words = [keyword, SYNONYMS[keyword]].filter(Boolean)
  const text = [
    item.nickname,
    item.channelName,
    item.bio,
    ...item.contentCategories.map((c) => c.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return words.some((w) => text.includes(w.toLowerCase()))
}

type SearchMockOptions = {
  /** 503 SEARCH_UNAVAILABLE을 준다 */
  unavailable?: boolean
  /** 이 검색어의 응답을 Promise가 풀릴 때까지 미룬다(늦게 온 응답 확인용) */
  hold?: { keyword: string; until: Promise<void> }
}

/**
 * 인플루언서 검색(GET /search/influencers). SEARCH_MEMBERS를 필터·정렬해 페이지로 준다.
 * sort가 허용 밖이면 400 UNSUPPORTED_SORT, (page+1)×size > 1000이면 400 PAGE_TOO_DEEP,
 * unavailable이면 503 SEARCH_UNAVAILABLE. 받은 쿼리를 차례로 남긴다
 */
export function mockInfluencerSearch({
  unavailable = false,
  hold,
}: SearchMockOptions = {}) {
  const requests: URLSearchParams[] = []
  server.use(
    http.get('*/api/v1/search/influencers', async ({ request }) => {
      const q = new URL(request.url).searchParams
      requests.push(q)
      if (unavailable)
        return problem(
          503,
          'SEARCH_UNAVAILABLE',
          '지금은 검색할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        )
      const sort = q.get('sort')
      if (sort !== null && sort !== 'followers,desc' && sort !== 'rating,desc')
        return problem(
          400,
          'UNSUPPORTED_SORT',
          '지원하지 않는 정렬입니다. followers,desc 또는 rating,desc만 쓸 수 있습니다.',
        )
      const page = Number(q.get('page') ?? 0)
      const size = Math.min(Number(q.get('size') ?? 20), 100)
      if ((page + 1) * size > 1000)
        return problem(
          400,
          'PAGE_TOO_DEEP',
          '검색 결과는 앞에서 1,000건까지만 볼 수 있습니다. 검색어나 조건을 좁혀 주세요.',
        )
      const keyword = (q.get('keyword') ?? '').trim()
      if (hold && keyword === hold.keyword) await hold.until

      const codes = q.getAll('contentCategories').flatMap((v) => v.split(','))
      const verified = q.get('verified')
      const minFollowers = Number(q.get('minFollowers') ?? 0)
      const minRating = q.get('minRating')
      const hits = (item: InfluencerSearchItem) =>
        item.contentCategories.filter((c) => codes.includes(c.code)).length
      const found = SEARCH_MEMBERS.filter(
        (item) =>
          (!keyword || matches(item, keyword)) &&
          (codes.length === 0 || hits(item) > 0) &&
          (verified === null ||
            (item.role === 'VERIFIED_INFLUENCER') === (verified === 'true')) &&
          item.followerCount >= minFollowers &&
          (minRating === null ||
            (item.appearanceRating.average ?? -1) >= Number(minRating)),
      ).sort((a, b) =>
        sort === 'rating,desc'
          ? (b.appearanceRating.average ?? 0) -
            (a.appearanceRating.average ?? 0)
          : !keyword && codes.length > 1 && hits(b) !== hits(a)
            ? hits(b) - hits(a)
            : b.followerCount - a.followerCount,
      )
      const total = Math.min(found.length, 1000)
      const data: PagedModel<InfluencerSearchItem> = {
        content: found.slice(page * size, (page + 1) * size),
        page: {
          size,
          number: page,
          totalElements: total,
          totalPages: Math.ceil(total / size),
        },
      }
      return rs(data)
    }),
  )
  return requests
}

/** 검색 결과 n명이 있는 것처럼 응답한다(페이지·1,000건 한도 확인용). 회원은 SEARCH_MEMBERS를 돌려 쓴다 */
export function mockManySearchResults(totalElements: number) {
  server.use(
    http.get('*/api/v1/search/influencers', ({ request }) => {
      const q = new URL(request.url).searchParams
      const page = Number(q.get('page') ?? 0)
      const size = Number(q.get('size') ?? 20)
      if ((page + 1) * size > 1000)
        return problem(
          400,
          'PAGE_TOO_DEEP',
          '검색 결과는 앞에서 1,000건까지만 볼 수 있습니다. 검색어나 조건을 좁혀 주세요.',
        )
      const total = Math.min(totalElements, 1000)
      return rs({
        content: SEARCH_MEMBERS.slice(0, size).map((m, i) => ({
          ...m,
          id: 1000 + page * size + i,
          nickname: `${m.nickname} ${page * size + i + 1}`,
        })),
        page: {
          size,
          number: page,
          totalElements: total,
          totalPages: Math.ceil(total / size),
        },
      })
    }),
  )
}
