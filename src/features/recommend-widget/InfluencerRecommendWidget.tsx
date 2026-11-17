import { useQuery } from '@tanstack/react-query'
import type { CSSProperties } from 'react'
import { influencerWidgetQuery } from '@/entities/chatbot/api'
import { influencerReasonText } from '@/entities/chatbot/labels'
import type { RecommendBasis } from '@/entities/chatbot/types'
import { InfluencerReasonCard } from '@/features/chatbot/InfluencerReasonCard'
import { CardRow } from './CardRow'
import strip from './RecommendStrip.module.css'
import { RecommendStrip } from './RecommendStrip'
import { shownRecommendation } from './shownRecommendation'

/** 띠 제목. 모르는 근거는 중립 제목으로 부른다 */
function titleOf(basis: RecommendBasis): string {
  switch (basis) {
    case 'PERSONALIZED':
      return '함께 방송하기 좋은 인플루언서'
    case 'POPULAR':
    case 'POPULAR_TEMPORARY':
      return '요즘 인기 있는 인플루언서'
    default:
      return '추천 인플루언서'
  }
}

/**
 * 인플루언서 목록 위쪽의 추천 인플루언서 띠(GET /chatbot/recommendations/influencers, LLM 없음, FE #220).
 * 카드는 챗봇과 같은 카드(회원 프로필로 닉네임·사진)이고, 이유 문장이 없는 위젯이라 이유 코드의 정해진 문장을 쓴다.
 * 맞춤 재료가 없으면(needsInterest) 프로필 분야를 넣으라고 안내하고, 추천하지 못했으면 notice를 그대로 보인다.
 * 로그인 회원만 부르고, 보여 줄 것이 없으면 띠를 숨긴다.
 */
export function InfluencerRecommendWidget({ signedIn }: { signedIn: boolean }) {
  const { data } = useQuery({ ...influencerWidgetQuery, enabled: signedIn })
  const shown = signedIn ? shownRecommendation(data) : null
  if (!shown) return null
  return (
    <RecommendStrip
      title={titleOf(shown.basis)}
      note={
        shown.needsInterest
          ? '프로필에 콘텐츠 분야를 입력하면 더 잘 맞는 추천을 받을 수 있어요.'
          : undefined
      }
    >
      {shown.items.length > 0 ? (
        <CardRow label="추천 인플루언서">
          {shown.items.map((item, i) => (
            <li key={item.memberId} style={{ '--i': i } as CSSProperties}>
              <InfluencerReasonCard
                item={{
                  ...item,
                  explanation:
                    item.explanation ?? influencerReasonText(item.reasons),
                }}
              />
            </li>
          ))}
        </CardRow>
      ) : (
        <p className={strip.notice}>{shown.notice}</p>
      )}
    </RecommendStrip>
  )
}
