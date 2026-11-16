import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Rating } from '@/entities/lecture/ui/Rating'
import {
  lookup,
  UNKNOWN_NAME,
  type StatusLabel,
} from '@/shared/lib/statusLabel'
import { Avatar } from '@/shared/ui/Avatar'
import type { ContentCategory, RatingSummary } from '../types'
import { ContentCategoryChips } from './ContentCategoryChips'
import styles from './InfluencerCard.module.css'

/** 카드에 그리는 인플루언서. 인플루언서 목록 한 줄과 검색 결과 한 줄(사진은 일괄 조회로 채운다)이 모두 맞는다 */
export type InfluencerCardMember = {
  id: number
  nickname: string
  role: string
  profileImageUrl: string | null
  appearanceRating: RatingSummary
  contentCategories: readonly ContentCategory[]
}

type InfluencerCardProps = {
  member: InfluencerCardMember
  /** 사진을 불러오지 못했을 때(검색 결과는 그 회원 주소만 다시 받는다) */
  onImageError?: () => void
  /** 평점 아래에 더할 내용(검색 결과의 대표 채널·자기소개) */
  children?: ReactNode
  /** '프로필' 뒤에 붙는 동작 버튼(`btn sm`). 역할에 따라 고르는 쪽이 넘긴다 */
  actions?: ReactNode
}

/** 카드에 보이는 콘텐츠 분야 수. 나머지는 '+n'으로 줄인다 */
const CARD_CATEGORY_MAX = 3

const ROLE_LABEL: Readonly<Record<string, StatusLabel>> = {
  VERIFIED_INFLUENCER: ['info', '인증된 인플루언서'],
  INFLUENCER: ['mute', '인플루언서'],
}

/**
 * 인플루언서 카드: 사진·닉네임·등급·출연 평점·콘텐츠 분야와 동작.
 * 카드 전체를 링크로 감싸지 않는다(링크 안에 버튼을 둘 수 없다). 닉네임과 '프로필'이 프로필 링크다.
 */
export function InfluencerCard({
  member,
  onImageError,
  children,
  actions,
}: InfluencerCardProps) {
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
          onImageError={onImageError}
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
      <ContentCategoryChips
        categories={member.contentCategories}
        max={CARD_CATEGORY_MAX}
      />
      {children}
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
