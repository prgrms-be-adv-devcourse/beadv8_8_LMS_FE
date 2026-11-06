import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { chatGroupsQuery } from '@/entities/chat/api'
import { groupStatusLabel, historyUntil } from '@/entities/chat/group'
import type { ChatRoom } from '@/entities/chat/types'
import { isRecruitOpen } from '@/entities/appearance/recruit'
import type { Recruit } from '@/entities/appearance/types'
import type { Viewer } from '@/shared/auth/role'
import { formatDate } from '@/shared/lib/date'
import { InlineLoadError } from '@/shared/ui/QueryState'
import { useCreateGroup } from './useGroupActions'

/** 단체방에 참여할 수 있는 역할(채팅 권한) */
const CHAT_VIEWERS: Viewer[] = ['INFLUENCER', 'VERIFIED_INFLUENCER']

/**
 * 모집글의 단체방. 호스트는 현재 방을 만들거나 열고, 읽기 전용으로 남은 이전 방도 본다. 초대받은 참여자는 볼 수 있는 방만 연다.
 * 현재 방은 모집글당 하나다(폐쇄하면 모집 중일 때 새 방을 만들 수 있다)
 */
export function RecruitGroupPanel({
  recruit,
  host,
  viewer,
}: {
  recruit: Recruit
  host: boolean
  viewer: Viewer
}) {
  const enabled = host || CHAT_VIEWERS.includes(viewer)
  const { data, error, refetch, isFetching } = useQuery({
    ...chatGroupsQuery(recruit.id),
    enabled,
  })
  const create = useCreateGroup(recruit.id)
  if (!enabled) return null
  // 참여자는 볼 수 있는 방이 있을 때만 보인다(불러오지 못했으면 다시 시도할 수 있게 보인다).
  if (
    !host &&
    !error &&
    (!data || (!data.currentRoom && data.previousRooms.length === 0))
  )
    return null
  const current = data?.currentRoom
  const open = isRecruitOpen(recruit)

  return (
    <section className="panel" aria-labelledby="recruit-group-title">
      <div className="panel-head">
        <h2 id="recruit-group-title">단체방</h2>
      </div>
      {error && (
        <InlineLoadError
          title="단체방을 불러오지 못했어요."
          error={error}
          retrying={isFetching}
          retry={() => void refetch()}
        />
      )}
      {current ? (
        <div className="toolbar">
          <span>
            {current.group?.title ?? recruit.title}{' '}
            <span className="fine">
              참여자 {current.group?.memberCount ?? 0}명
            </span>{' '}
            {current.status !== 'ACTIVE' && (
              <span className="pill mute">
                {groupStatusLabel(current.status)}
              </span>
            )}
          </span>
          <Link className="btn primary sm" to={`/chat/${current.chatRoomId}`}>
            단체방 열기
          </Link>
        </div>
      ) : host && data ? (
        open ? (
          <div className="toolbar">
            <p className="fine">
              지원자를 초대해 한 방에서 일정과 진행을 맞출 수 있어요. 초대한
              회원은 바로 참여해요.
            </p>
            <button
              type="button"
              className="btn primary sm"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              단체방 만들기
            </button>
          </div>
        ) : (
          <p className="fine">모집 중인 모집글에만 단체방을 만들 수 있어요.</p>
        )
      ) : null}
      {data && data.previousRooms.length > 0 && (
        <PreviousRooms rooms={data.previousRooms} />
      )}
    </section>
  )
}

/** 읽기 전용으로 남은 이전 방(최근 방부터). 새 방과 헷갈리지 않게 만든 날과 볼 수 있는 기한을 보인다 */
function PreviousRooms({ rooms }: { rooms: ChatRoom[] }) {
  return (
    <div className="rows" aria-label="이전 단체방">
      {rooms.map((room) => (
        <div key={room.chatRoomId} className="row-item">
          <div className="row-main">
            <span className="row-title">
              {room.group?.title}{' '}
              <span className="pill mute">{groupStatusLabel(room.status)}</span>
            </span>
            <span className="fine">
              {formatDate(room.createdAt)}에 만든 방
              {room.group && historyUntil(room.group)
                ? ` · ${historyUntil(room.group)}`
                : ''}
            </span>
          </div>
          <div className="row-actions">
            <Link className="btn ghost sm" to={`/chat/${room.chatRoomId}`}>
              열기
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
