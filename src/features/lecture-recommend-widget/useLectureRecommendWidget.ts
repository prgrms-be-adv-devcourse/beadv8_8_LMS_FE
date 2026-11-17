import { useQuery } from '@tanstack/react-query'
import { lectureWidgetQuery } from '@/entities/chatbot/api'
import type { LectureRecommendation } from '@/entities/chatbot/types'

/**
 * 강의 추천 위젯의 데이터(GET /chatbot/recommendations/lectures, LLM 없음). 로그인 회원만 부른다(비회원은 401).
 * 보여 줄 것이 없으면 null이고 화면은 영역을 숨긴다: 불러오는 중, 429·오류(다시 시도하지 않는다), 추천이 비었을 때.
 */
export function useLectureRecommendWidget(
  signedIn: boolean,
): LectureRecommendation | null {
  const { data } = useQuery({ ...lectureWidgetQuery, enabled: signedIn })
  if (!signedIn || !data || data.items.length === 0) return null
  return data
}
