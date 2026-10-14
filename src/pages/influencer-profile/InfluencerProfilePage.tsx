import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { memberProfileQuery } from '@/entities/member/api'
import { MemberProfileView } from '@/entities/member/ui/MemberProfileView'
import { useViewer } from '@/shared/auth/session'
import { LoadError, Loading } from '@/shared/ui/QueryState'

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
            // TODO(4번 출연 요청): 인플루언서에게 출연 요청 보내기·채팅 버튼
            viewer === 'USER' && (
              <>
                <div className="notice">
                  출연 요청과 채팅은 채널 인증을 마친 인플루언서부터 쓸 수
                  있어요.
                </div>
                <Link className="btn block" to="/verify">
                  채널 인증하기
                </Link>
              </>
            )
          }
        />
      )}
    </div>
  )
}
