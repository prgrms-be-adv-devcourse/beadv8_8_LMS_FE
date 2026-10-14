import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { CHZZK_CONNECT_URL, myChannelsQuery } from '@/entities/member/api'
import {
  AUTO_APPROVE_FOLLOWER_COUNT,
  canRequestApproval,
  CHZZK_FAILURE_MESSAGE,
} from '@/entities/member/channel'
import type { MyChannel } from '@/entities/member/types'
import { ChannelCard } from '@/entities/member/ui/ChannelCard'
import { ChannelStatusPill } from '@/entities/member/ui/ChannelStatusPill'
import { useRequestApproval } from '@/features/channel/useRequestApproval'
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
  ['관리자 심사', '기준에 못 미치면 승인 요청 후 관리자가 심사해요.'],
  ['인플루언서 전환', '출연 요청·지원, 채팅, 환전을 쓸 수 있어요.'],
] as const

export function VerifyPage() {
  const [params] = useSearchParams()
  const {
    data: channels,
    error,
    isPending,
    refetch,
  } = useQuery(myChannelsQuery)

  return (
    <div className="page">
      <PageHead
        title="채널 인증"
        lede="치지직 채널을 인증하면 인플루언서가 되어 출연 요청·지원, 채팅, 환전을 쓸 수 있어요."
      />
      <ConnectResult result={params.get('chzzk')} code={params.get('code')} />
      <div className="split">
        <section className="panel">
          <div className="panel-head">
            <h2>내 채널</h2>
            <a className="btn primary sm" href={CHZZK_CONNECT_URL}>
              치지직 채널 연동하기
            </a>
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
          <ol className={styles.steps}>
            {STEPS.map(([title, desc], i) => (
              <li key={title}>
                <span className={styles.n}>{i + 1}</span>
                <div>
                  <b>{title}</b>
                  <div className="fine">{desc}</div>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  )
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
      <div className="notice">
        채널을 등록했어요. 팔로워 {AUTO_APPROVE_FOLLOWER_COUNT}명 미만이라
        아래에서 승인 요청을 해 주세요.
      </div>
    )
  if (result === 'failed')
    return (
      <div className="notice bad" role="alert">
        {(code && CHZZK_FAILURE_MESSAGE[code]) ??
          '치지직 연동에 실패했어요. 잠시 후 다시 시도해 주세요.'}
      </div>
    )
  return null
}
