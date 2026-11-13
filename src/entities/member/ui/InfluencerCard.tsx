import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Rating } from '@/entities/lecture/ui/Rating'
import {
  lookup,
  UNKNOWN_NAME,
  type StatusLabel,
} from '@/shared/lib/statusLabel'
import { Avatar } from '@/shared/ui/Avatar'
import type { MemberProfile } from '../types'
import styles from './InfluencerCard.module.css'

type InfluencerCardProps = {
  member: MemberProfile
  /** '프로필' 뒤에 붙는 동작 버튼(`btn sm`). 역할에 따라 고르는 쪽이 넘긴다 */
  actions?: ReactNode
}

const ROLE_LABEL: Readonly<Record<string, StatusLabel>> = {
  VERIFIED_INFLUENCER: ['info', '인증된 인플루언서'],
  INFLUENCER: ['mute', '인플루언서'],
}

/**
 * 인플루언서 카드: 사진·닉네임·등급·출연 평점과 동작.
 * 카드 전체를 링크로 감싸지 않는다(링크 안에 버튼을 둘 수 없다). 닉네임과 '프로필'이 프로필 링크다.
 */
export function InfluencerCard({ member, actions }: InfluencerCardProps) {
  const nameId = useId()
  const profileHref = `/influencers/${member.id}`
  const [roleTone, roleLabel] = lookup(ROLE_LABEL, member.role) ?? [
    'mute',
    UNKNOWN_NAME,
  ]
  return (
    <article className={styles.card} aria-labelledby={nameId}>
      <div className={styles.top}>
        <Avatar
          name={member.nickname}
          imageUrl={member.profileImageUrl}
          size={48}
        />
        <div className={styles.meta}>
          <Link id={nameId} className={styles.name} to={profileHref}>
            {member.nickname}
          </Link>
          <span>
            <span className={`pill ${roleTone}`}>{roleLabel}</span>
          </span>
          <span className={styles.rating}>
            <Rating {...member.appearanceRating} />
          </span>
        </div>
      </div>
      <div className={styles.actions}>
        <Link
          className="btn sm"
          to={profileHref}
          aria-label={`${member.nickname} 님 프로필`}
        >
          프로필
        </Link>
        {actions}
      </div>
    </article>
  )
}
