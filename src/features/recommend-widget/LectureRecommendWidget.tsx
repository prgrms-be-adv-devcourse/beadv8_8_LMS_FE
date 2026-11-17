import { useQuery } from '@tanstack/react-query'
import { lectureWidgetQuery } from '@/entities/chatbot/api'
import type { RecommendBasis } from '@/entities/chatbot/types'
import { LectureRecommendList } from './LectureRecommendList'
import strip from './RecommendStrip.module.css'
import { RecommendStrip } from './RecommendStrip'
import { shownRecommendation } from './shownRecommendation'

/** 띠 제목. 모르는 근거는 중립 제목으로 부른다 */
function titleOf(basis: RecommendBasis): string {
  switch (basis) {
    case 'PERSONALIZED':
      return '나에게 맞춘 추천 강의'
    case 'POPULAR':
    case 'POPULAR_TEMPORARY':
      return '요즘 많이 듣는 강의'
    default:
      return '추천 강의'
  }
}

/**
 * 강의 목록 위쪽의 추천 강의 띠(GET /chatbot/recommendations/lectures, LLM 없음). 이유 붙은 카드를 늘 펼쳐 둔다.
 * 로그인 회원만 부르고, 보여 줄 것이 없으면 띠를 숨긴다(shownRecommendation). 추천하지 못했으면 notice를 보인다.
 */
export function LectureRecommendWidget({ signedIn }: { signedIn: boolean }) {
  const { data } = useQuery({ ...lectureWidgetQuery, enabled: signedIn })
  const shown = signedIn ? shownRecommendation(data) : null
  if (!shown) return null
  return (
    <RecommendStrip title={titleOf(shown.basis)}>
      {shown.items.length > 0 ? (
        <LectureRecommendList items={shown.items} />
      ) : (
        <p className={strip.notice}>{shown.notice}</p>
      )}
    </RecommendStrip>
  )
}
