import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import type { InfluencerRecommendItem } from '@/entities/chatbot/types'
import { memberProfileQuery } from '@/entities/member/api'
import { Avatar } from '@/shared/ui/Avatar'
import styles from './cards.module.css'
import { closeOnNarrowScreen } from './store'

const UNKNOWN_MEMBER = '알 수 없는 회원'

/**
 * 추천 인플루언서 카드: 닉네임·사진(회원 프로필로 채운다), 분야, 출연 수·평점, 이유 문장.
 * 누르면 창을 연 채로(좁은 화면은 닫고) 인플루언서 프로필로 간다. 프로필을 불러오지 못하면 '알 수 없는 회원'으로 보인다.
 */
export function InfluencerReasonCard({
  item,
}: {
  item: InfluencerRecommendItem
}) {
  const { data: profile, isPending } = useQuery(
    memberProfileQuery(item.memberId),
  )
  const name = profile?.nickname ?? (isPending ? '' : UNKNOWN_MEMBER)
  return (
    <Link
      to={`/influencers/${item.memberId}`}
      className={`${styles.card} ${styles.influencer}`}
      onClick={closeOnNarrowScreen}
      aria-busy={isPending}
    >
      <Avatar
        name={name || '·'}
        imageUrl={profile?.profileImageUrl}
        size={40}
      />
      <span className={styles.body}>
        <b className={styles.title}>{name || '불러오는 중…'}</b>
        <span className={styles.meta}>
          {[
            ...item.categoryNames,
            `출연 ${item.completedAppearances}회`,
            item.averageRating === null ? null : `★ ${item.averageRating}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {item.explanation && (
          <span className={styles.reason}>{item.explanation}</span>
        )}
      </span>
    </Link>
  )
}
