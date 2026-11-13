import { Link } from 'react-router'
import { Rating } from '@/entities/lecture/ui/Rating'
import { Avatar } from '@/shared/ui/Avatar'
import type { MemberProfile } from '../types'
import styles from './InfluencerCard.module.css'

/** 인플루언서 목록의 카드 한 장: 사진·닉네임·등급·출연 평점 */
export function InfluencerCard({ member }: { member: MemberProfile }) {
  return (
    <Link className={styles.card} to={`/influencers/${member.id}`}>
      <Avatar
        name={member.nickname}
        imageUrl={member.profileImageUrl}
        size={48}
      />
      <div className={styles.meta}>
        <span className={styles.name}>{member.nickname}</span>
        <span>
          {member.role === 'VERIFIED_INFLUENCER' ? (
            <span className="pill info">인증된 인플루언서</span>
          ) : (
            <span className="pill mute">인플루언서</span>
          )}
        </span>
        <span className={styles.rating}>
          <Rating {...member.appearanceRating} />
        </span>
      </div>
    </Link>
  )
}
