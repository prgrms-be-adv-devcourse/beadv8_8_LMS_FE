import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { myChannelsQuery } from '@/entities/member/api'
import {
  AUTO_APPROVE_FOLLOWER_COUNT,
  canRequestApproval,
  CHANNEL_CRITERIA,
  CHZZK_FAILURE_MESSAGE,
  REVIEW_BROADCAST_HOURS,
} from '@/entities/member/channel'
import type { MyChannel } from '@/entities/member/types'
import { ChannelCard } from '@/entities/member/ui/ChannelCard'
import { ChannelStatusPill } from '@/entities/member/ui/ChannelStatusPill'
import { useConnectChzzk } from '@/features/channel/useConnectChzzk'
import { useRequestApproval } from '@/features/channel/useRequestApproval'
import { RoleJourney } from '@/features/upgrade/RoleJourney'
import { StatusCard } from '@/features/upgrade/StatusCard'
import { useViewer } from '@/shared/auth/session'
import { formatDate } from '@/shared/lib/date'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './VerifyPage.module.css'

const STEPS = [
  ['치지직 연동', '치지직 로그인으로 채널 소유를 확인해요.'],
  [
    '기준 확인',
    `팔로워 ${AUTO_APPROVE_FOLLOWER_COUNT}명 이상이면 바로 승인돼요.`,
  ],
  [
    '관리자 심사',
    `못 미치면 승인 요청 후 관리자가 한 달 누적 방송 ${REVIEW_BROADCAST_HOURS}시간을 확인해요.`,
  ],
  ['인플루언서 전환', '출연 요청·지원, 채팅, 환전을 쓸 수 있어요.'],
] as const

export function VerifyPage() {
  const [params] = useSearchParams()
  const viewer = useViewer()
  // 승인되면 이 화면에서 바로 인플루언서가 된다. 채널 연동은 유저만 할 수 있다(BE).
  const verified = viewer === 'INFLUENCER' || viewer === 'VERIFIED_INFLUENCER'
  const {
    data: channels,
    error,
    isPending,
    refetch,
  } = useQuery(myChannelsQuery)
  const connect = useConnectChzzk()
  const at = stepAt(verified, channels)

  return (
    <div className="page">
      <PageHead
        title="채널 인증"
        lede="치지직 채널을 인증하면 인플루언서가 되어 출연 요청·지원, 채팅, 환전을 쓸 수 있어요."
      />
      <RoleJourney
        current={
          viewer === 'VERIFIED_INFLUENCER' ? 2 : viewer === 'INFLUENCER' ? 1 : 0
        }
        target={1}
      />
      {verified ? (
        <StatusCard
          tone="ok"
          role="status"
          title={<span className="pill ok">인증 완료</span>}
        >
          <p>
            채널 인증을 마쳤어요. 이제 출연 요청·지원, 채팅, 환전을 쓸 수
            있어요. 프로필을 채우면 상대가 출연을 요청하기 쉬워져요.
            {viewer === 'INFLUENCER' &&
              ' 강의를 팔려면 승급을 신청해 인증된 인플루언서가 돼야 해요.'}
          </p>
          <div className="row-actions">
            <Link className="btn primary sm" to="/profile/edit">
              프로필 채우기
            </Link>
            {viewer === 'INFLUENCER' && (
              <Link className="btn sm" to="/promote">
                승급 신청
              </Link>
            )}
            <Link className="btn ghost sm" to="/influencers">
              인플루언서 둘러보기
            </Link>
          </div>
        </StatusCard>
      ) : (
        <ConnectResult result={params.get('chzzk')} code={params.get('code')} />
      )}
      <div className="split">
        <section className="panel">
          <div className="panel-head">
            <h2>내 채널</h2>
            {!verified && (
              <button
                type="button"
                className="btn primary sm"
                // 받은 주소로 이동하는 동안에도 다시 누르지 않게 둔다.
                disabled={connect.isPending || connect.isSuccess}
                onClick={() => connect.mutate()}
              >
                치지직 채널 연동하기
              </button>
            )}
          </div>
          {isPending ? (
            <Loading />
          ) : error ? (
            <LoadError error={error} retry={refetch} />
          ) : channels.length === 0 ? (
            <p className="fine">
              아직 연동한 채널이 없어요. 치지직 로그인 후 채널 정보를 불러와요.
            </p>
          ) : (
            <div className="rows">
              {channels.map((channel) => (
                <MyChannelRow key={channel.id} channel={channel} />
              ))}
            </div>
          )}
        </section>
        <aside className="panel">
          <h2>진행 순서</h2>
          <p className="fine">{CHANNEL_CRITERIA}</p>
          <ol className={styles.steps}>
            {STEPS.map(([title, desc], i) => {
              const state = i < at ? 'done' : i === at ? 'now' : 'next'
              return (
                <li
                  key={title}
                  className={styles[state]}
                  aria-current={state === 'now' ? 'step' : undefined}
                >
                  <span className={styles.n} aria-hidden="true">
                    {state === 'done' ? '✓' : i + 1}
                  </span>
                  <div>
                    <b>{title}</b>
                    <div className="fine">{desc}</div>
                  </div>
                </li>
              )
            })}
          </ol>
        </aside>
      </div>
    </div>
  )
}

/**
 * 진행 순서에서 지금 단계(화면 표시용). 인증을 마쳤으면 모두 지났고, 연동한 채널이 있으면 남은 일은 관리자 심사다
 */
function stepAt(verified: boolean, channels: MyChannel[] | undefined) {
  if (verified) return STEPS.length
  return channels && channels.length > 0 ? 2 : 0
}

function MyChannelRow({ channel }: { channel: MyChannel }) {
  const request = useRequestApproval()
  return (
    <ChannelCard
      channel={channel}
      aside={
        <div className="row-actions">
          <ChannelStatusPill status={channel.status} />
          {canRequestApproval(channel.status) && (
            <button
              type="button"
              className="btn sm"
              disabled={request.isPending}
              onClick={() => request.mutate(channel.id)}
            >
              {channel.status === 'REJECTED' ? '다시 승인 요청' : '승인 요청'}
            </button>
          )}
        </div>
      }
    >
      {channel.status === 'REJECTED' && channel.rejectionReason && (
        <span className="fine c-bad">반려 사유: {channel.rejectionReason}</span>
      )}
      {channel.status === 'PENDING' && channel.requestedAt && (
        <span className="fine">
          {formatDate(channel.requestedAt)}에 승인을 요청했어요. 보통 1~2 영업일
          걸려요.
        </span>
      )}
      {channel.status === 'REGISTERED' && (
        <span className="fine">
          팔로워가 {AUTO_APPROVE_FOLLOWER_COUNT}명 미만이라 관리자 심사가
          필요해요. 승인 요청 때 팔로워 수를 다시 확인해요.
        </span>
      )}
    </ChannelCard>
  )
}

/** 치지직 연동 뒤 돌아왔을 때 결과 안내 (?chzzk=registered|failed&code=) */
function ConnectResult({
  result,
  code,
}: {
  result: string | null
  code: string | null
}) {
  if (result === 'registered')
    return (
      <StatusCard tone="info">
        <p>
          채널을 등록했어요. 팔로워 {AUTO_APPROVE_FOLLOWER_COUNT}명 미만이라
          아래에서 승인 요청을 해 주세요.
        </p>
      </StatusCard>
    )
  if (result === 'failed')
    return (
      <StatusCard tone="bad" role="alert">
        <p>
          {(code && CHZZK_FAILURE_MESSAGE[code]) ??
            '치지직 연동에 실패했어요. 잠시 후 다시 시도해 주세요.'}
        </p>
        <span className="fine">아래 내 채널에서 다시 연동할 수 있어요.</span>
      </StatusCard>
    )
  return null
}
