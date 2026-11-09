import type { ReactNode } from 'react'
import { Avatar } from '@/shared/ui/Avatar'
import { formatNumber } from '@/shared/lib/money'
import type { MemberProfileDetail, RatingSummary } from '../types'
import { ChannelCard } from './ChannelCard'
import { ReceivedAppearanceReviews } from './ReceivedAppearanceReviews'

type MemberProfileViewProps = {
  profile: MemberProfileDetail
  /** 오른쪽 패널에 넣을 행동(출연 요청, 프로필 수정 등) */
  aside?: ReactNode
}

const ROLE_LABEL = {
  VERIFIED_INFLUENCER: ['info', '인증된 인플루언서'],
  INFLUENCER: ['mute', '인플루언서'],
} as const

/** 다른 회원에게 보이는 공개 프로필 */
export function MemberProfileView({ profile, aside }: MemberProfileViewProps) {
  const totalFollowers = profile.channels.reduce(
    (sum, c) => sum + c.followerCount,
    0,
  )
  const role =
    profile.role === 'VERIFIED_INFLUENCER' || profile.role === 'INFLUENCER'
      ? ROLE_LABEL[profile.role]
      : null

  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 20,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Avatar
          name={profile.nickname}
          imageUrl={profile.profileImageUrl}
          size={76}
        />
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <h1 style={{ fontSize: 26, fontWeight: 700 }}>{profile.nickname}</h1>
          {role && <span className={`pill ${role[0]}`}>{role[1]}</span>}
        </div>
      </div>
      <div className={aside ? 'split' : undefined}>
        <div className="page" style={{ gap: 16 }}>
          <div className="summary">
            <div className="sum">
              <span>팔로워 (채널 합계)</span>
              <b>{formatNumber(totalFollowers)}</b>
            </div>
            <div className="sum">
              <span>인증된 채널</span>
              <b>{profile.channels.length}개</b>
            </div>
            <RatingSum rating={profile.appearanceRating.total} />
          </div>
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
        {aside && <aside className="panel sticky">{aside}</aside>}
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
        <b style={{ color: 'var(--ink-3)' }}>리뷰 없음</b>
      </div>
    )
  return (
    <div className="sum">
      <span>출연 평점 · 리뷰 {formatNumber(count)}개</span>
      <b
        style={{ color: 'var(--hold)' }}
        aria-label={`평점 ${average.toFixed(1)}점, 리뷰 ${count}개`}
      >
        ★ {average.toFixed(1)}
      </b>
    </div>
  )
}
