import type { ReactNode } from 'react'
import { Avatar } from '@/shared/ui/Avatar'
import { formatNumber } from '@/shared/lib/money'
import type { MemberProfileDetail, RatingSummary } from '../types'
import { ChannelCard } from './ChannelCard'
import { ContentCategoryChips } from './ContentCategoryChips'
import { ReceivedAppearanceReviews } from './ReceivedAppearanceReviews'
import { VerifiedMark } from './VerifiedMark'
import styles from './MemberProfileView.module.css'

type MemberProfileViewProps = {
  profile: MemberProfileDetail
  /** 오른쪽 패널에 넣을 행동(출연 요청, 프로필 수정 등) */
  aside?: ReactNode
}

const ROLE_LABEL = {
  VERIFIED_INFLUENCER: ['info', '인증된 인플루언서'],
  INFLUENCER: ['mute', '인플루언서'],
} as const

/** 다른 회원에게 보이는 공개 프로필. 머리는 방송 채널 머리처럼(큰 사진·이름·등급·분야·소개와 지표) */
export function MemberProfileView({ profile, aside }: MemberProfileViewProps) {
  const totalFollowers = profile.channels.reduce(
    (sum, c) => sum + c.followerCount,
    0,
  )
  const role =
    profile.role === 'VERIFIED_INFLUENCER' || profile.role === 'INFLUENCER'
      ? ROLE_LABEL[profile.role]
      : null
  const verified = profile.role === 'VERIFIED_INFLUENCER'

  return (
    <>
      <div
        className={
          verified ? `${styles.header} ${styles.verified}` : styles.header
        }
      >
        <div className={styles.band} aria-hidden="true" />
        <div className={styles.identity}>
          <span className={styles.avatar}>
            <Avatar
              name={profile.nickname}
              imageUrl={profile.profileImageUrl}
              size={96}
            />
            {verified && <VerifiedMark className={styles.check} />}
          </span>
          <div className={styles.meta}>
            <div className={styles.nameRow}>
              <h1 className={styles.name}>{profile.nickname}</h1>
              {role && <span className={`pill ${role[0]}`}>{role[1]}</span>}
            </div>
            {/* 닉네임 아래에 분야(받은 순서), 그 아래에 자기소개. 없으면 그 줄을 그리지 않는다 */}
            <ContentCategoryChips categories={profile.contentCategories} />
            {profile.bio && <p className={styles.bio}>{profile.bio}</p>}
          </div>
        </div>
        <div className={`summary ${styles.stats}`}>
          <div className="sum">
            <span>팔로워 (채널 합계)</span>
            <b className={styles.num}>{formatNumber(totalFollowers)}</b>
          </div>
          <div className="sum">
            <span>인증된 채널</span>
            <b className={styles.num}>{profile.channels.length}개</b>
          </div>
          <RatingSum rating={profile.appearanceRating.total} />
        </div>
      </div>
      <div className={aside ? styles.layout : undefined}>
        {/* 좁은 화면에서는 행동 패널을 머리 바로 아래에 둬 스크롤 끝까지 내려가지 않아도 누를 수 있게 한다 */}
        {aside && <aside className={`panel ${styles.aside}`}>{aside}</aside>}
        <div className={styles.main}>
          <section className="panel">
            <h2>채널</h2>
            {profile.channels.length === 0 ? (
              <p className="fine">등록된 채널이 없어요.</p>
            ) : (
              <div className="rows">
                {profile.channels.map((channel) => (
                  <ChannelCard key={channel.channelUrl} channel={channel} />
                ))}
              </div>
            )}
          </section>
          <ReceivedAppearanceReviews
            memberId={profile.id}
            rating={profile.appearanceRating}
          />
        </div>
      </div>
    </>
  )
}

/**
 * 요약 카드의 받은 출연 리뷰 전체 평점. 카드 글자(.sum span·b) 크기를 따르려고 Rating 대신 직접 그린다.
 */
function RatingSum({ rating: { average, count } }: { rating: RatingSummary }) {
  if (average === null || count === 0)
    return (
      <div className="sum">
        <span>출연 평점</span>
        <b className={styles.none}>리뷰 없음</b>
      </div>
    )
  return (
    <div className="sum">
      <span>출연 평점 · 리뷰 {formatNumber(count)}개</span>
      <b
        className={`${styles.num} ${styles.star}`}
        aria-label={`평점 ${average.toFixed(1)}점, 리뷰 ${count}개`}
      >
        ★ {average.toFixed(1)}
      </b>
    </div>
  )
}
