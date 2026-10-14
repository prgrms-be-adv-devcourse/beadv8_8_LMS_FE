import { useQuery } from '@tanstack/react-query'
import { Avatar } from '@/shared/ui/Avatar'
import { memberProfileQuery } from '../api'

/**
 * 회원 ID만 있는 목록(출연 요청 등)에서 상대를 닉네임·사진으로 보여 준다.
 * 같은 회원은 한 번만 부른다(Query 캐시).
 */
export function MemberChip({
  memberId,
  size = 40,
}: {
  memberId: number
  size?: number
}) {
  const { data } = useQuery(memberProfileQuery(memberId))
  const name = data?.nickname ?? '…'
  return (
    <span
      style={{
        display: 'inline-flex',
        gap: 10,
        alignItems: 'center',
        minWidth: 0,
      }}
    >
      <Avatar name={name} imageUrl={data?.profileImageUrl} size={size} />
      <b
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </b>
    </span>
  )
}
