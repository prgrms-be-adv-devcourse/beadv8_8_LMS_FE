import type { Recommendation } from '@/entities/chatbot/types'

/**
 * 위젯이 띠로 보여 줄 추천인지. 아직 받지 못했거나(불러오는 중, 429·오류로 받은 적 없음) 추천도 notice도 없으면 null이고
 * 화면은 띠를 숨긴다. 한 번 받은 뒤 다시 불러오다 실패해도(429 등) 쿼리가 이전 결과를 들고 있어 그대로 보인다.
 */
export function shownRecommendation<T>(
  data: Recommendation<T> | undefined,
): Recommendation<T> | null {
  if (!data) return null
  if (data.items.length === 0 && !data.notice) return null
  return data
}
