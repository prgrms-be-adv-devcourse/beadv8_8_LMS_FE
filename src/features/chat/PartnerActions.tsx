import { Link } from 'react-router'
import { useStartChat } from './useChatActions'

/** 출연 상대와 채팅하기·프로필 보기. 출연 상대는 늘 인플루언서라 인플루언서 프로필로 간다 */
export function PartnerActions({ memberId }: { memberId: number }) {
  const startChat = useStartChat()
  return (
    <div className="row-actions">
      <button
        type="button"
        className="btn sm"
        disabled={startChat.isPending}
        onClick={() => startChat.mutate(memberId)}
      >
        채팅하기
      </button>
      <Link className="btn ghost sm" to={`/influencers/${memberId}`}>
        프로필 보기
      </Link>
    </div>
  )
}
