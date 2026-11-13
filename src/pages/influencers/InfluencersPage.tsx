import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { influencersQuery } from '@/entities/member/api'
import type { MemberProfile } from '@/entities/member/types'
import { InfluencerCard } from '@/entities/member/ui/InfluencerCard'
import { RequestFormModal } from '@/features/appearance-request/RequestFormModal'
import { useStartChat } from '@/features/chat/useChatActions'
import { meQuery } from '@/shared/auth/me'
import { INFLUENCER, type Viewer } from '@/shared/auth/role'
import { useViewer } from '@/shared/auth/session'
import { useClampPage, usePageParam } from '@/shared/lib/usePageParam'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { Pager } from '@/shared/ui/Pager'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './InfluencersPage.module.css'

const isInfluencer = (role: Viewer | undefined) =>
  role !== undefined && INFLUENCER.includes(role)

export function InfluencersPage() {
  const viewer = useViewer()
  const [page, setPage] = usePageParam('page')
  const query = useQuery(influencersQuery(page))
  const moving = useClampPage(page, query, setPage)
  const { data, error, isPending, refetch } = query
  const startChat = useStartChat()
  const [requestTo, setRequestTo] = useState<MemberProfile | null>(null)

  // 프로필 화면과 같은 규칙: 인플루언서끼리는 채팅·출연 요청, 관리자는 채팅만, 유저·비회원은 프로필만
  const actionsFor = (member: MemberProfile) =>
    (isInfluencer(viewer) || viewer === 'ADMIN') &&
    isInfluencer(member.role) && (
      <CardActions
        member={member}
        chatting={startChat.isPending}
        onChat={() => startChat.mutate(member.id)}
        onRequest={() => setRequestTo(member)}
      />
    )

  return (
    <div className="page">
      <PageHead
        title="인플루언서"
        lede="채널 인증을 마친 인플루언서예요. 프로필에서 채널·팔로워 수와 받은 출연 리뷰를 확인할 수 있어요."
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
              <InfluencerCard
                key={member.id}
                member={member}
                actions={actionsFor(member)}
              />
            ))}
          </div>
          <Pager
            page={data.page.number}
            totalPages={data.page.totalPages}
            onChange={setPage}
          />
        </>
      )}
      {requestTo && (
        <RequestFormModal
          guest={requestTo}
          onClose={() => setRequestTo(null)}
        />
      )}
    </div>
  )
}

type CardActionsProps = {
  member: MemberProfile
  chatting: boolean
  onChat: () => void
  onRequest: () => void
}

/**
 * 관리자는 출연 거래를 할 수 없어 채팅만 시작한다(BE: 채팅은 인플루언서 이상·관리자).
 * 내 카드에는 출연 요청·채팅 대신 내 프로필 편집으로 가는 링크를 둔다.
 */
function CardActions({
  member,
  chatting,
  onChat,
  onRequest,
}: CardActionsProps) {
  const viewer = useViewer()
  const { data: me } = useQuery(meQuery)

  const chat = (
    <button
      type="button"
      className="btn sm"
      disabled={chatting}
      aria-label={`${member.nickname} 님과 채팅`}
      onClick={onChat}
    >
      채팅
    </button>
  )
  if (viewer === 'ADMIN') return chat
  if (me?.id === member.id)
    return (
      <Link className="btn sm" to="/profile/edit">
        내 프로필
      </Link>
    )
  return (
    <>
      {chat}
      <button
        type="button"
        className="btn primary sm"
        aria-label={`${member.nickname} 님에게 출연 요청`}
        onClick={onRequest}
      >
        출연 요청
      </button>
    </>
  )
}
