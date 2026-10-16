import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { influencersQuery } from '@/entities/member/api'
import { useViewer } from '@/shared/auth/session'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { Avatar } from '@/shared/ui/Avatar'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './InfluencersPage.module.css'

export function InfluencersPage() {
  const viewer = useViewer()
  const [page, setPage] = usePageParam('page')
  const query = useQuery(influencersQuery(page))
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, refetch } = query

  return (
    <div className="page">
      <PageHead
        title="인플루언서"
        lede="채널 인증을 마친 인플루언서예요. 프로필에서 채널과 팔로워 수를 확인할 수 있어요."
      />
      {viewer === 'USER' && (
        <div className="notice">
          출연 요청과 채팅은 채널 인증을 마친 인플루언서부터 쓸 수 있어요.
          <Link className="link" to="/verify">
            채널 인증하기
          </Link>
        </div>
      )}
      {isPending || moving ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : data.content.length === 0 ? (
        <EmptyState title="아직 인증된 인플루언서가 없어요" />
      ) : (
        <>
          <div className={styles.grid}>
            {data.content.map((member) => (
              <Link
                key={member.id}
                className={styles.card}
                to={`/influencers/${member.id}`}
              >
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
                </div>
              </Link>
            ))}
          </div>
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={setPage}
          />
        </>
      )}
    </div>
  )
}
