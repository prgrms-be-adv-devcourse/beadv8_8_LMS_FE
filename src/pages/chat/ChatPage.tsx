import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from 'react'
import { Link, useParams } from 'react-router'
import {
  chatKeys,
  chatMembersQuery,
  chatMessagesQuery,
  chatRoomsQuery,
  isGroupRoom,
  myMembershipIn,
  orderedMessages,
  partnerOf,
  sortRoomsByRecent,
} from '@/entities/chat/api'
import {
  groupStatusLabel,
  groupPermissions,
  groupStatusNotice,
} from '@/entities/chat/group'
import {
  notificationLine,
  notificationPreview,
  UNKNOWN_MEMBER,
  type NameOf,
} from '@/entities/chat/notification'
import {
  CHAT_MESSAGE_COUNT_FROM,
  CHAT_MESSAGE_MAX_LENGTH,
  type ChatGroupSummary,
  type ChatMessage,
  type ChatRoom,
} from '@/entities/chat/types'
import { HostCrown } from '@/entities/chat/ui/HostCrown'
import { NotificationCard } from '@/entities/chat/ui/NotificationCard'
import {
  CloseGroupModal,
  GroupMembersModal,
  InviteModal,
} from '@/features/chat-group/GroupModals'
import {
  discardPending,
  retryPending,
  sendChatMessage,
  setViewingRoom,
  useChatStore,
  type PendingMessage,
} from '@/features/chat/chatStore'
import { useUnreadMemberCount } from '@/features/chat/readCounts'
import { useLeaveChat } from '@/features/chat/useChatActions'
import { useMarkRoomRead } from '@/features/chat/useChatUnread'
import { meQuery } from '@/shared/auth/me'
import { formatDate, parseServerDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import { Avatar } from '@/shared/ui/Avatar'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { InlineLoadError, LoadError, Loading } from '@/shared/ui/QueryState'
import { toast } from '@/shared/ui/toastStore'
import styles from './ChatPage.module.css'

export function ChatPage() {
  const chatRoomId = Number(useParams().chatRoomId) || null
  const { data: me } = useQuery(meQuery)
  // 상대의 재입장은 BE가 남은 회원에게 보내는 재입장 안내(SYSTEM 메시지)로 알게 되고, 그때 방 상태를 다시 부른다.
  const {
    data: rooms,
    error,
    isPending,
    isFetching,
    refetch,
  } = useQuery(chatRoomsQuery)

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
            : '인플루언서끼리 1:1로, 또는 모집 단체방에서 일정과 조건을 맞춰요. 대화 기록은 분쟁 확인용으로 보관돼요.'
        }
      />
      {/* 이미 보이는 목록이 있으면 다시 불러오기가 실패해도 그대로 두고 위에서 알린다. */}
      {rooms && error && (
        <InlineLoadError
          title="대화 목록을 새로 불러오지 못했어요."
          error={error}
          retrying={isFetching}
          retry={() => void refetch()}
        />
      )}
      {isPending || !me ? (
        <Loading />
      ) : !rooms ? (
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
                ? '채팅방을 찾을 수 없어요. 이미 나갔거나 내보내진 방일 수 있어요.'
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
        const group = isGroupRoom(room) ? room.group : null
        const name = group ? group.title : (partner?.nickname ?? UNKNOWN_MEMBER)
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
            <Avatar
              name={group ? group.title : (partner?.nickname ?? '?')}
              size={36}
            />
            <span className={styles.rm}>
              <b>
                {name}
                {group && (
                  <span className={styles.groupMeta}>
                    단체 {group.memberCount}명
                  </span>
                )}
              </b>
              <span>{roomPreview(room, myUserId, partner?.active)}</span>
            </span>
            {group && room.status !== 'ACTIVE' && (
              <span className="pill mute">{groupStatusLabel(room.status)}</span>
            )}
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
  if (last.messageType !== 'TEXT') return notificationPreview(last)
  if (last.senderUserId === myUserId) return `나: ${last.content}`
  // 단체방은 여러 사람이 보내므로 보낸 사람을 앞에 붙인다.
  return room.roomType === 'GROUP'
    ? `${senderName(last)}: ${last.content}`
    : last.content
}

function Thread({ room, myUserId }: { room: ChatRoom; myUserId: number }) {
  const group = isGroupRoom(room) ? room.group : null
  const perms = isGroupRoom(room) ? groupPermissions(room, myUserId) : null
  const partner = partnerOf(room, myUserId)
  const me = myMembershipIn(room, myUserId)
  const partnerLeft = partner !== undefined && !partner.active
  const status = useChatStore((s) => s.status)
  const pending = useChatStore((s) => s.pending[room.chatRoomId]) ?? NO_PENDING
  const [text, setText] = useState('')
  const {
    data,
    error,
    isPending,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteQuery(chatMessagesQuery(room.chatRoomId))

  // 오래된 것부터 그린다(순번순, 같은 메시지는 한 번).
  const messages = data ? orderedMessages(data.pages) : []
  const nameOf = useNoticeNames(room.chatRoomId, group !== null, messages)
  const latestId = messages.at(-1)?.messageId
  // 화면에 보인 가장 최근 메시지까지 읽음으로 알린다(방을 보는 중 받은 메시지 포함).
  // 읽음에는 이력 응답의 참여 세대를 붙인다(없으면 방 목록의 내 세대).
  useMarkRoomRead(
    room.chatRoomId,
    messages.at(-1)?.roomSequence,
    data?.pages[0]?.participationVersion ?? me?.participationVersion,
  )
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
    // 실패하면 메시지가 늘지 않아 위치를 되돌리는 효과가 돌지 않는다. 기억한 위치를 지워야
    // 그 뒤 새 메시지가 왔을 때 맨 아래로 내려간다(다시 시도하면 새로 잡는다).
    void fetchNextPage().then((result) => {
      if (result.isError) keepOffset.current = null
    })
  }

  const send = (e: FormEvent) => {
    e.preventDefault()
    const content = text.trim()
    if (!content) return
    // 연결이 없으면 실패로 표시돼 다시 보낼 수 있다.
    sendChatMessage(room.chatRoomId, content)
    setText('')
  }

  // 붙여넣으면 넘는 길이는 입력창(maxLength)이 말없이 버리므로, 직접 잘라 넣고 알린다.
  const inputRef = useRef<HTMLInputElement>(null)
  const caretAfterPaste = useRef<number | null>(null)
  const pasteWithinLimit = (e: ClipboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    // 한 줄 입력창은 줄바꿈을 지우고 넣는다. 같은 기준으로 세고, 줄바꿈이 있으면 직접 지워 넣는다.
    const raw = e.clipboardData.getData('text')
    const pasted = raw.replace(/[\r\n]/g, '')
    const start = input.selectionStart ?? text.length
    const end = input.selectionEnd ?? text.length
    const room = CHAT_MESSAGE_MAX_LENGTH - (text.length - (end - start))
    const truncated = pasted.length > room
    if (!truncated && pasted === raw) return
    e.preventDefault()
    const inserted = truncated
      ? pasted.slice(0, cutWithinLimit(pasted, room))
      : pasted
    const next = text.slice(0, start) + inserted + text.slice(end)
    // 값을 바꾸면 커서가 끝으로 가므로, 그린 뒤 넣은 자리 바로 뒤로 되돌린다(값이 그대로면 다시 그리지 않는다).
    if (next !== text) {
      setText(next)
      caretAfterPaste.current = start + inserted.length
    }
    if (!truncated) return
    toast(
      `메시지는 ${formatNumber(CHAT_MESSAGE_MAX_LENGTH)}자까지 보낼 수 있어 넘는 부분은 잘라 넣었어요.`,
    )
  }
  useLayoutEffect(() => {
    const caret = caretAfterPaste.current
    if (caret === null) return
    caretAfterPaste.current = null
    inputRef.current?.setSelectionRange(caret, caret)
  }, [text])
  const showCount = text.length > CHAT_MESSAGE_COUNT_FROM

  return (
    <section
      className={styles.thread}
      aria-label={
        group
          ? `${group.title} 단체방`
          : `${partner?.nickname ?? ''} 님과의 대화`
      }
    >
      {group && perms ? (
        <GroupHead
          chatRoomId={room.chatRoomId}
          status={room.status}
          group={group}
          perms={perms}
          myUserId={myUserId}
          participationVersion={me?.participationVersion}
        />
      ) : (
        <DirectHead
          chatRoomId={room.chatRoomId}
          partner={partner}
          participationVersion={me?.participationVersion}
        />
      )}
      <div className={styles.msgs} ref={listRef} aria-live="polite">
        {isPending ? (
          <Loading />
        ) : !data ? (
          <LoadError error={error} retry={refetch} />
        ) : (
          <>
            {/* 보이던 대화는 그대로 두고, 실패는 그 자리에서 알린다. */}
            {error && !isFetchNextPageError && (
              <InlineLoadError
                title="대화를 새로 불러오지 못했어요."
                error={error}
                retrying={isFetching}
                retry={() => void refetch()}
              />
            )}
            {error && isFetchNextPageError ? (
              <InlineLoadError
                title="이전 메시지를 불러오지 못했어요."
                error={error}
                retrying={isFetchingNextPage}
                retry={loadOlder}
              />
            ) : (
              hasNextPage && (
                <button
                  type="button"
                  className="btn ghost sm"
                  style={{ alignSelf: 'center' }}
                  disabled={isFetchingNextPage}
                  onClick={loadOlder}
                >
                  {isFetchingNextPage ? '불러오는 중…' : '이전 메시지 더 보기'}
                </button>
              )
            )}
            {messages.length === 0 && (
              <p
                className="fine"
                style={{ textAlign: 'center', marginTop: 40 }}
              >
                {group
                  ? perms?.canInvite
                    ? '단체방이 열렸어요. 지원자를 초대해 대화를 시작해 보세요.'
                    : '이 방에서 볼 수 있는 대화가 아직 없어요.'
                  : `${partner?.nickname} 님과 대화를 시작해 보세요.`}
              </p>
            )}
            {messages.map((m) => (
              <MessageItem
                key={m.messageId}
                message={m}
                mine={m.senderUserId === myUserId}
                group={group}
                nameOf={nameOf}
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
      ) : isGroupRoom(room) && perms && !perms.canSend ? (
        // 단체방이 사용 중이 아니면(일시 중지·읽기 전용) 보낼 수 없다. 읽기·나가기는 그대로 된다.
        <div className={styles.partnerLeft} role="status">
          {groupStatusNotice(room, perms.host)}
        </div>
      ) : (
        <form className={styles.composer} onSubmit={send}>
          <div className={styles.composerInput}>
            <input
              ref={inputRef}
              className="input"
              value={text}
              maxLength={CHAT_MESSAGE_MAX_LENGTH}
              onChange={(e) => setText(e.target.value)}
              onPaste={pasteWithinLimit}
              placeholder={
                status === 'connected'
                  ? '메시지 입력'
                  : '채팅 서버에 연결하는 중…'
              }
              aria-label="메시지"
              aria-describedby={showCount ? 'chat-count' : undefined}
              autoComplete="off"
            />
            {showCount && (
              <span id="chat-count" className={`fine ${styles.count}`}>
                {formatNumber(text.length)} /{' '}
                {formatNumber(CHAT_MESSAGE_MAX_LENGTH)}
              </span>
            )}
          </div>
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

/** 1:1 방 머리: 상대, 프로필, 나가기(한 번 더 확인), 닫기 */
function DirectHead({
  chatRoomId,
  partner,
  participationVersion,
}: {
  chatRoomId: number
  partner: ReturnType<typeof partnerOf>
  participationVersion: number | undefined
}) {
  const leave = useLeaveChat()
  const [confirmLeave, setConfirmLeave] = useState(false)
  return (
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
        <LeaveConfirm
          message="나가면 이 대화 기록을 다시 볼 수 없고 상대에게 퇴장 안내가 가요. 대화만 닫으려면 ✕를 눌러요."
          pending={leave.isPending || participationVersion === undefined}
          onCancel={() => setConfirmLeave(false)}
          onLeave={() =>
            participationVersion !== undefined &&
            leave.mutate({ chatRoomId, participationVersion })
          }
        />
      ) : (
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setConfirmLeave(true)}
        >
          나가기
        </button>
      )}
      <CloseThread />
    </div>
  )
}

/**
 * 단체방 머리: 제목, 상태, 참여자 수(참여자 목록), 모집글. 호스트는 초대·폐쇄, 참여자는 나가기.
 * 호스트는 나가기 대신 폐쇄하고, 직접 폐쇄한 방에서만 나갈 수 있다
 */
function GroupHead({
  chatRoomId,
  status,
  group,
  perms,
  myUserId,
  participationVersion,
}: {
  chatRoomId: number
  status: ChatRoom['status']
  group: ChatGroupSummary
  perms: ReturnType<typeof groupPermissions>
  myUserId: number
  participationVersion: number | undefined
}) {
  const leave = useLeaveChat()
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [modal, setModal] = useState<'members' | 'invite' | 'close' | null>(
    null,
  )
  const closeModal = () => setModal(null)
  useRefreshOnMemberCount(chatRoomId, group.memberCount)
  return (
    <div className={styles.threadHead}>
      <Avatar name={group.title} size={32} />
      <div className={styles.who}>
        <b>
          {group.title}
          {status !== 'ACTIVE' && (
            <span className="pill mute">{groupStatusLabel(status)}</span>
          )}
        </b>
        <span className={styles.groupLinks}>
          <button
            type="button"
            className="link fine"
            onClick={() => setModal('members')}
          >
            참여자 {group.memberCount}명
          </button>
          <Link className="fine" to={`/recruits/${group.recruitId}`}>
            모집글 보기
          </Link>
        </span>
      </div>
      {perms.canInvite && (
        <button
          type="button"
          className="btn sm"
          onClick={() => setModal('invite')}
        >
          초대
        </button>
      )}
      {perms.canClose && (
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setModal('close')}
        >
          폐쇄
        </button>
      )}
      {perms.canLeave &&
        (confirmLeave ? (
          <LeaveConfirm
            message={
              perms.host
                ? '나가면 이 방의 대화를 다시 볼 수 없어요.'
                : '나가면 이 방의 대화를 다시 볼 수 없고, 호스트가 다시 초대해야만 들어올 수 있어요.'
            }
            pending={leave.isPending || participationVersion === undefined}
            onCancel={() => setConfirmLeave(false)}
            onLeave={() =>
              participationVersion !== undefined &&
              leave.mutate({ chatRoomId, participationVersion })
            }
          />
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setConfirmLeave(true)}
          >
            나가기
          </button>
        ))}
      <CloseThread />
      {modal === 'members' && (
        <GroupMembersModal
          chatRoomId={chatRoomId}
          group={group}
          myUserId={myUserId}
          canKick={perms.canKick}
          onClose={closeModal}
        />
      )}
      {/* 방이 사용 중이 아니게 되면(폐쇄 안내 등) 열려 있던 초대·폐쇄 창을 닫는다. */}
      {modal === 'invite' && perms.canInvite && (
        <InviteModal
          chatRoomId={chatRoomId}
          group={group}
          onClose={closeModal}
        />
      )}
      {modal === 'close' && perms.canClose && (
        <CloseGroupModal
          chatRoomId={chatRoomId}
          group={group}
          onClose={closeModal}
        />
      )}
    </div>
  )
}

/**
 * 방 인원이 바뀌면 참여자·초대 후보를 다시 받는다. 참여 변화는 대개 안내 메시지로 알지만, 재동기화로 이력만 채운 경우나
 * 안내를 남기지 않는 변화(읽기 전용 방의 나가기)는 방 목록의 인원으로만 드러난다
 */
function useRefreshOnMemberCount(chatRoomId: number, memberCount: number) {
  const queryClient = useQueryClient()
  const seen = useRef(memberCount)
  useEffect(() => {
    if (seen.current === memberCount) return
    seen.current = memberCount
    void queryClient.invalidateQueries({
      queryKey: chatKeys.members(chatRoomId),
    })
    void queryClient.invalidateQueries({
      queryKey: chatKeys.candidates(chatRoomId),
    })
  }, [queryClient, chatRoomId, memberCount])
}

function LeaveConfirm({
  message,
  pending,
  onCancel,
  onLeave,
}: {
  message: string
  pending: boolean
  onCancel: () => void
  onLeave: () => void
}) {
  return (
    <span className={styles.leaveConfirm}>
      <span className="fine">{message}</span>
      <button type="button" className="btn ghost sm" onClick={onCancel}>
        취소
      </button>
      <button
        type="button"
        className="btn danger sm"
        disabled={pending}
        onClick={onLeave}
      >
        나가기
      </button>
    </span>
  )
}

/** 닫기는 화면만 닫는다(퇴장 아님). 참여는 유지되고 이후 메시지는 안 읽은 수로 쌓인다. */
function CloseThread() {
  return (
    <Link
      className={styles.close}
      to="/chat"
      aria-label="대화 닫기"
      title="대화 닫기 (나가지 않아요)"
    >
      ✕
    </Link>
  )
}

/**
 * 단체방 안내에 나오는 회원 이름. 안내는 회원 ID만 담으므로(보낸 사람 정보 없음) 다음 순서로 찾는다.
 * 1. 불러온 메시지의 보낸 사람 정보(나간·내보내진 회원도 메시지를 보낸 적이 있으면 이름이 남는다)
 * 2. 참여자 목록(첫 페이지부터 불러온 만큼) 3. 내 정보
 * 못 찾으면 undefined(템플릿이 '알 수 없는 회원'으로 쓴다)
 */
function useNoticeNames(
  chatRoomId: number,
  enabled: boolean,
  messages: ChatMessage[],
): NameOf {
  const { data } = useInfiniteQuery({
    ...chatMembersQuery(chatRoomId),
    enabled,
  })
  const { data: me } = useQuery(meQuery)
  const names = useMemo(() => {
    const map = new Map<number, string>()
    for (const page of data?.pages ?? [])
      for (const m of page.members) map.set(m.userId, m.nickname)
    // 메시지의 보낸 사람 정보가 더 넓다(나간 회원 포함). 최근 메시지의 이름을 쓴다.
    for (const m of messages)
      if (m.sender?.nickname) map.set(m.sender.userId, m.sender.nickname)
    return map
  }, [data, messages])
  return useCallback(
    (userId: number) =>
      names.get(userId) ?? (userId === me?.id ? me.nickname : undefined),
    [names, me],
  )
}

/** 보낸 사람 이름(서버의 보낸 사람 정보). 회원 정보가 없으면 '알 수 없는 회원' */
function senderName(message: ChatMessage) {
  return message.sender?.nickname ?? UNKNOWN_MEMBER
}

/**
 * 붙여넣을 글에서 room(UTF-16 단위)까지 자를 위치. 이모지 같은 서로게이트 쌍의 가운데서 자르면
 * 깨진 문자가 남으므로 그 쌍 앞에서 자른다.
 */
function cutWithinLimit(pasted: string, room: number) {
  if (room <= 0) return 0
  const lead = pasted.charCodeAt(room - 1)
  return lead >= 0xd800 && lead <= 0xdbff ? room - 1 : room
}

const NO_PENDING: PendingMessage[] = []

/**
 * 보내는 중·실패·결과 미확인인 내 메시지. 실패·결과 미확인이면 같은 임시 ID로 다시 보내기·지우기.
 * 결과 미확인은 저장됐을 수도 있어 실패와 따로 안내한다(다시 보내도 두 번 저장되지 않는다).
 */
function PendingItem({
  chatRoomId,
  pending,
}: {
  chatRoomId: number
  pending: PendingMessage
}) {
  if (pending.status === 'sending')
    return (
      <div className={`${styles.msg} ${styles.me} ${styles.sending}`}>
        <div className={styles.bubble}>{pending.content}</div>
        <time>보내는 중…</time>
      </div>
    )
  const unconfirmed = pending.status === 'unconfirmed'
  return (
    <div
      className={`${styles.msg} ${styles.me} ${unconfirmed ? styles.unconfirmed : styles.failed}`}
    >
      <div className={styles.bubble}>{pending.content}</div>
      <span
        className={unconfirmed ? styles.unconfirmedNote : styles.failNote}
        role="alert"
      >
        {unconfirmed ? (
          <>
            <strong>전송 결과를 확인하지 못했어요.</strong>
            {pending.error && <span>{pending.error}</span>}
          </>
        ) : (
          <span>{pending.error ?? '보내지 못했어요.'}</span>
        )}
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
  group,
  nameOf,
}: {
  message: ChatMessage
  mine: boolean
  /** 단체방이면 다른 사람 메시지에 보낸 사람 이름과 호스트 왕관을 보인다 */
  group: ChatGroupSummary | null
  /** 단체방 안내의 회원 이름 */
  nameOf: NameOf
}) {
  const unread = useUnreadMemberCount(message)
  if (message.messageType === 'SYSTEM')
    return <p className={styles.system}>{notificationLine(message, nameOf)}</p>
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
      {group && !mine && (
        <span className={styles.sender}>
          {senderName(message)}
          {message.senderUserId === group.hostUserId && <HostCrown />}
        </span>
      )}
      <div className={styles.bubble}>{message.content}</div>
      <span className={styles.meta}>
        {/* 안 읽은 사람 수(0이면 숨김, 보낸 사람 제외). 누가 읽었는지는 보이지 않는다. 1:1 방의 내 메시지는 상대가
            읽기 전까지 1이고, 상대 메시지의 1은 내가 아직 읽지 않았다는 뜻이다. */}
        {unread !== undefined && (
          <span
            className={styles.unreadCount}
            aria-label={
              !group && mine
                ? '상대가 아직 읽지 않음'
                : `안 읽은 사람 ${unread}명`
            }
          >
            {unread}
          </span>
        )}
        <time dateTime={message.sentAt}>
          {timeFormatter.format(parseServerDate(message.sentAt))}
        </time>
      </span>
    </div>
  )
}
