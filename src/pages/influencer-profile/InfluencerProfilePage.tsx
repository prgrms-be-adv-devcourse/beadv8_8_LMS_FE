import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { MINIMUM_FEE } from '@/entities/appearance/rules'
import { memberProfileQuery } from '@/entities/member/api'
import type { MemberProfileDetail } from '@/entities/member/types'
import { MemberProfileView } from '@/entities/member/ui/MemberProfileView'
import { RequestFormModal } from '@/features/appearance-request/RequestFormModal'
import { useStartChat } from '@/features/chat/useChatActions'
import { meQuery } from '@/shared/auth/me'
import { INFLUENCER, type Viewer } from '@/shared/auth/role'
import { useViewer } from '@/shared/auth/session'
import { LoadError, Loading } from '@/shared/ui/QueryState'

const isInfluencer = (role: Viewer | undefined) =>
  role !== undefined && INFLUENCER.includes(role)

export function InfluencerProfilePage() {
  const memberId = Number(useParams().memberId)
  const viewer = useViewer()
  const { data, error, isPending, refetch } = useQuery(
    memberProfileQuery(memberId),
  )

  return (
    <div className="page">
      <Link className="back" to="/influencers">
        ← 인플루언서
      </Link>
      {isPending ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : (
        <MemberProfileView
          profile={data}
          aside={
            // 유저에게는 채널 인증 안내, 인플루언서끼리는 출연 요청·채팅, 관리자는 인플루언서와 채팅.
            // 그 밖에는 패널을 두지 않는다.
            (viewer === 'USER' ||
              ((isInfluencer(viewer) || viewer === 'ADMIN') &&
                isInfluencer(data.role))) && <ProfileActions profile={data} />
          }
        />
      )}
    </div>
  )
}

/**
 * 출연 요청은 인플루언서끼리만 주고받는다. 유저에게는 채널 인증을 안내한다.
 * 관리자는 출연 거래를 할 수 없고, 인플루언서 이상 회원과 채팅만 시작한다(BE: 채팅은 인플루언서 이상·관리자).
 */
function ProfileActions({ profile }: { profile: MemberProfileDetail }) {
  const viewer = useViewer()
  const { data: me } = useQuery(meQuery)
  const [requesting, setRequesting] = useState(false)
  const startChat = useStartChat()

  if (viewer === 'USER')
    return (
      <>
        <div className="notice">
          출연 요청과 채팅은 채널 인증을 마친 인플루언서부터 쓸 수 있어요.
        </div>
        <Link className="btn block" to="/verify">
          채널 인증하기
        </Link>
      </>
    )
  if (viewer === 'ADMIN')
    return (
      <>
        <button
          type="button"
          className="btn primary block"
          disabled={startChat.isPending}
          onClick={() => startChat.mutate(profile.id)}
        >
          채팅 시작
        </button>
        <p className="fine">대화 기록은 판단 근거로 보관돼요.</p>
      </>
    )
  if (me?.id === profile.id)
    return (
      <Link className="btn block" to="/profile/edit">
        내 프로필 보기
      </Link>
    )
  return (
    <>
      <button
        type="button"
        className="btn primary block"
        onClick={() => setRequesting(true)}
      >
        출연 요청 보내기
      </button>
      <button
        type="button"
        className="btn block"
        disabled={startChat.isPending}
        onClick={() => startChat.mutate(profile.id)}
      >
        채팅으로 일정 맞추기
      </button>
      <p className="fine">
        요청을 보내면 출연료만큼 HP가 보류되고, 게스트가 수락하면 출연이
        성립해요. 최저 출연료는 {MINIMUM_FEE.toLocaleString()} HP예요.
      </p>
      {requesting && (
        <RequestFormModal
          guest={profile}
          onClose={() => setRequesting(false)}
        />
      )}
    </>
  )
}
