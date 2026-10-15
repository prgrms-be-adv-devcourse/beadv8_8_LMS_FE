import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link, useParams } from 'react-router'
import {
  chatMessagesQuery,
  chatRoomsQuery,
  orderedMessages,
  partnerOf,
  sortRoomsByRecent,
} from '@/entities/chat/api'
import { firstLine } from '@/entities/chat/notification'
import type { ChatMessage, ChatRoom } from '@/entities/chat/types'
import { NotificationCard } from '@/entities/chat/ui/NotificationCard'
import {
  discardPending,
  retryPending,
  sendChatMessage,
  setViewingRoom,
  useChatStore,
  type PendingMessage,
} from '@/features/chat/chatStore'
import { useLeaveChat } from '@/features/chat/useChatActions'
import { useMarkRoomRead } from '@/features/chat/useChatUnread'
import { meQuery } from '@/shared/auth/me'
import { formatDate, parseServerDate } from '@/shared/lib/date'
import { Avatar } from '@/shared/ui/Avatar'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './ChatPage.module.css'

export function ChatPage() {
  const chatRoomId = Number(useParams().chatRoomId) || null
  const { data: me } = useQuery(meQuery)
  // 상대의 재입장은 BE가 남은 회원에게 보내는 재입장 안내(SYSTEM 메시지)로 알게 되고, 그때 방 상태를 다시 부른다.
  const { data: rooms, error, isPending, refetch } = useQuery(chatRoomsQuery)

  const room = rooms?.find((r) => r.chatRoomId === chatRoomId)

  // 보고 있는 방의 알림은 안 읽은 수로 세지 않는다. 화면을 떠나는 것은 퇴장이 아니다.
  useEffect(() => {
    setViewingRoom(chatRoomId)
    return () => setViewingRoom(null)
  }, [chatRoomId])

  return (
    <div className="page">
      <PageHead
        title="채팅"
        lede={
          me?.role === 'ADMIN'
            ? '인플루언서 이상 회원과 1:1로 대화해요. 대화 기록은 판단 근거로 보관돼요.'
            : '인플루언서끼리 1:1로 일정과 조건을 맞춰요. 대화 기록은 분쟁 확인용으로 보관돼요.'
        }
      />
      {isPending || !me ? (
        <Loading />
      ) : error ? (
        <LoadError error={error} retry={refetch} />
      ) : rooms.length === 0 && !chatRoomId ? (
        <EmptyState
          title="아직 대화가 없어요"
          action={
            <Link className="btn primary" to="/influencers">
              인플루언서 찾기
            </Link>
          }
        >
          인플루언서 프로필에서 채팅을 시작할 수 있어요.
        </EmptyState>
      ) : (
        <div
          className={
            chatRoomId ? `${styles.chat} ${styles.threadOpen}` : styles.chat
          }
        >
          <RoomList rooms={rooms} myUserId={me.id} currentId={chatRoomId} />
          {room ? (
            <Thread key={room.chatRoomId} room={room} myUserId={me.id} />
          ) : (
            <div className={styles.placeholder}>
              {chatRoomId
                ? '채팅방을 찾을 수 없어요. 이미 나간 방일 수 있어요.'
                : '왼쪽에서 대화를 골라 주세요.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RoomList({
  rooms,
  myUserId,
  currentId,
}: {
  rooms: ChatRoom[]
  myUserId: number
  currentId: number | null
}) {
  const sorted = sortRoomsByRecent(rooms)
  return (
    <nav className={styles.rooms} aria-label="대화 목록">
      {sorted.map((room) => {
        const partner = partnerOf(room, myUserId)
        // 보고 있는 방은 읽음 처리 중이라 0으로 보인다.
        const count =
          room.chatRoomId === currentId ? 0 : (room.unreadCount ?? 0)
        return (
          <Link
            key={room.chatRoomId}
            to={`/chat/${room.chatRoomId}`}
            className={
              room.chatRoomId === currentId
                ? `${styles.room} ${styles.on}`
                : styles.room
            }
            aria-current={room.chatRoomId === currentId ? 'page' : undefined}
          >
            <Avatar name={partner?.nickname ?? '?'} size={36} />
            <span className={styles.rm}>
              <b>{partner?.nickname ?? '알 수 없는 회원'}</b>
              <span>{roomPreview(room, myUserId, partner?.active)}</span>
            </span>
            {count > 0 && (
              <span
                className={styles.cnt}
                aria-label={`안 읽은 메시지 ${count}개`}
              >
                {count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

/** 방 목록 두 번째 줄: 마지막 메시지(없으면 시작 날짜) */
function roomPreview(
  room: ChatRoom,
  myUserId: number,
  partnerActive: boolean | undefined,
) {
  if (partnerActive === false) return '상대가 나간 대화'
  const last = room.lastMessage
  if (!last) return `${formatDate(room.createdAt)} 시작`
  if (last.messageType === 'NOTIFICATION') return firstLine(last.content)
  return last.senderUserId === myUserId && last.messageType === 'TEXT'
    ? `나: ${last.content}`
    : last.content
}

function Thread({ room, myUserId }: { room: ChatRoom; myUserId: number }) {
  const partner = partnerOf(room, myUserId)
  const me = room.members.find((m) => m.userId === myUserId)
  const partnerLeft = partner !== undefined && !partner.active
  const status = useChatStore((s) => s.status)
  const pending = useChatStore((s) => s.pending[room.chatRoomId]) ?? NO_PENDING
  const leave = useLeaveChat()
  const [text, setText] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)
  const {
    data,
    error,
    isPending,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(chatMessagesQuery(room.chatRoomId))

  // 오래된 것부터 그린다(순번순, 같은 메시지는 한 번).
  const messages = data ? orderedMessages(data.pages) : []
  const latestId = messages.at(-1)?.messageId
  // 화면에 보인 가장 최근 메시지까지 읽음으로 알린다(방을 보는 중 받은 메시지 포함).
  useMarkRoomRead(room.chatRoomId, messages.at(-1)?.roomSequence)
  const listRef = useRef<HTMLDivElement>(null)
  const keepOffset = useRef<number | null>(null)

  // 새 메시지가 오면 맨 아래로, 이전 메시지를 불러오면 보던 위치를 지킨다.
  useLayoutEffect(() => {
    const box = listRef.current
    if (!box) return
    if (keepOffset.current !== null) {
      box.scrollTop = box.scrollHeight - keepOffset.current
      keepOffset.current = null
    } else {
      box.scrollTop = box.scrollHeight
    }
  }, [latestId, messages.length, pending.length])

  const loadOlder = () => {
    const box = listRef.current
    if (box) keepOffset.current = box.scrollHeight - box.scrollTop
    void fetchNextPage()
  }

  const send = (e: FormEvent) => {
    e.preventDefault()
    const content = text.trim()
    if (!content) return
    // 연결이 없으면 실패로 표시돼 다시 보낼 수 있다.
    sendChatMessage(room.chatRoomId, content)
    setText('')
  }

  return (
    <section
      className={styles.thread}
      aria-label={`${partner?.nickname ?? ''} 님과의 대화`}
    >
      <div className={styles.threadHead}>
        <Avatar name={partner?.nickname ?? '?'} size={32} />
        <div className={styles.who}>
          <b>{partner?.nickname}</b>
          {partner && (
            <Link className="fine" to={`/influencers/${partner.userId}`}>
              프로필 보기
            </Link>
          )}
        </div>
        {confirmLeave ? (
          <span className={styles.leaveConfirm}>
            <span className="fine">
              나가면 이 대화 기록을 다시 볼 수 없고 상대에게 퇴장 안내가 가요.
              대화만 닫으려면 ✕를 눌러요.
            </span>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setConfirmLeave(false)}
            >
              취소
            </button>
            <button
              type="button"
              className="btn danger sm"
              disabled={leave.isPending || !me}
              onClick={() =>
                me &&
                leave.mutate({
                  chatRoomId: room.chatRoomId,
                  participationVersion: me.participationVersion,
                })
              }
            >
              나가기
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setConfirmLeave(true)}
          >
            나가기
          </button>
        )}
        {/* 닫기는 화면만 닫는다(퇴장 아님). 참여는 유지되고 이후 메시지는 안 읽은 수로 쌓인다. */}
        <Link
          className={styles.close}
          to="/chat"
          aria-label="대화 닫기"
          title="대화 닫기 (나가지 않아요)"
        >
          ✕
        </Link>
      </div>
      <div className={styles.msgs} ref={listRef} aria-live="polite">
        {isPending ? (
          <Loading />
        ) : error ? (
          <LoadError error={error} retry={refetch} />
        ) : (
          <>
            {hasNextPage && (
              <button
                type="button"
                className="btn ghost sm"
                style={{ alignSelf: 'center' }}
                disabled={isFetchingNextPage}
                onClick={loadOlder}
              >
                {isFetchingNextPage ? '불러오는 중…' : '이전 메시지 더 보기'}
              </button>
            )}
            {messages.length === 0 && (
              <p
                className="fine"
                style={{ textAlign: 'center', marginTop: 40 }}
              >
                {partner?.nickname} 님과 대화를 시작해 보세요.
              </p>
            )}
            {messages.map((m) => (
              <MessageItem
                key={m.messageId}
                message={m}
                mine={m.senderUserId === myUserId}
              />
            ))}
            {pending.map((p) => (
              <PendingItem
                key={p.clientMessageId}
                chatRoomId={room.chatRoomId}
                pending={p}
              />
            ))}
          </>
        )}
      </div>
      {partnerLeft ? (
        <div className={styles.partnerLeft} role="status">
          상대가 나간 대화예요. 상대가 다시 채팅을 시작하면 이어서 대화할 수
          있어요.
        </div>
      ) : (
        <form className={styles.composer} onSubmit={send}>
          <input
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              status === 'connected'
                ? '메시지 입력'
                : '채팅 서버에 연결하는 중…'
            }
            aria-label="메시지"
            autoComplete="off"
          />
          <button
            type="submit"
            className="btn primary"
            disabled={status !== 'connected' || !text.trim()}
          >
            보내기
          </button>
        </form>
      )}
    </section>
  )
}

const NO_PENDING: PendingMessage[] = []

/** 보내는 중이거나 실패한 내 메시지. 실패하면 다시 보내기·지우기 */
function PendingItem({
  chatRoomId,
  pending,
}: {
  chatRoomId: number
  pending: PendingMessage
}) {
  const failed = pending.status === 'failed'
  return (
    <div
      className={`${styles.msg} ${styles.me} ${failed ? styles.failed : styles.sending}`}
    >
      <div className={styles.bubble}>{pending.content}</div>
      {failed ? (
        <span className={styles.failNote} role="alert">
          <span>{pending.error ?? '보내지 못했어요.'}</span>
          <button
            type="button"
            className="link"
            onClick={() => retryPending(chatRoomId, pending.clientMessageId)}
          >
            다시 보내기
          </button>
          <button
            type="button"
            className="link"
            onClick={() => discardPending(chatRoomId, pending.clientMessageId)}
          >
            지우기
          </button>
        </span>
      ) : (
        <time>보내는 중…</time>
      )}
    </div>
  )
}

const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function MessageItem({
  message,
  mine,
}: {
  message: ChatMessage
  mine: boolean
}) {
  if (message.messageType === 'SYSTEM')
    return <p className={styles.system}>{message.content}</p>
  if (message.messageType === 'NOTIFICATION')
    return (
      <NotificationCard
        {...message}
        time={timeFormatter.format(parseServerDate(message.sentAt))}
        dateTime={message.sentAt}
      />
    )
  return (
    <div className={mine ? `${styles.msg} ${styles.me}` : styles.msg}>
      <div className={styles.bubble}>{message.content}</div>
      <time dateTime={message.sentAt}>
        {timeFormatter.format(parseServerDate(message.sentAt))}
      </time>
    </div>
  )
}
