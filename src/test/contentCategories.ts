import type { ContentCategory } from '@/entities/member/types'

/** 지금 BE에 들어 있는 분야 23개(실제 순서는 많이 고른 순이라 바뀐다). 분야 목록 기본 응답(server.ts)도 이 값이다 */
export const CONTENT_CATEGORIES: { code: string; name: string }[] = [
  { code: 'GAME', name: '게임' },
  { code: 'MUKBANG', name: '먹방' },
  { code: 'BEAUTY', name: '뷰티' },
  { code: 'JUST_CHATTING', name: '저스트채팅' },
  { code: 'MUSIC', name: '음악' },
  { code: 'SPORTS', name: '스포츠' },
  { code: 'EDUCATION', name: '교육·지식' },
  { code: 'DAILY_LIFE', name: '일상' },
  { code: 'LEAGUE_OF_LEGENDS', name: '리그 오브 레전드' },
  { code: 'VALORANT', name: '발로란트' },
  { code: 'MAPLESTORY', name: '메이플스토리' },
  { code: 'BATTLEGROUNDS', name: '배틀그라운드' },
  { code: 'LOST_ARK', name: '로스트아크' },
  { code: 'OVERWATCH', name: '오버워치' },
  { code: 'MINECRAFT', name: '마인크래프트' },
  { code: 'FC_ONLINE', name: 'FC 온라인' },
  { code: 'STARCRAFT', name: '스타크래프트' },
  { code: 'DUNGEON_FIGHTER', name: '던전앤파이터' },
  { code: 'SINGING', name: '노래' },
  { code: 'INSTRUMENT', name: '악기 연주' },
  { code: 'COOKING', name: '요리' },
  { code: 'TRAVEL', name: '여행' },
  { code: 'DRAWING', name: '그림' },
]

/** code 목록을 응답 모양({code, name})으로. 목록에 없는 code는 name이 null이다 */
export const categoriesOf = (...codes: string[]): ContentCategory[] =>
  codes.map((code) => ({
    code,
    name: CONTENT_CATEGORIES.find((c) => c.code === code)?.name ?? null,
  }))
