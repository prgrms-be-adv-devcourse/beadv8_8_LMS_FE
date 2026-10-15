import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { chatHistoryQuery } from '@/entities/chat/api'
import type {
  ChatHistoryMessage,
  ChatRoomEventType,
  ChatRoomHistory,
  ChatRoomLog,
} from '@/entities/chat/types'
import { isApiError } from '@/shared/api/ApiError'
import { formatDateTime, parseServerDate } from '@/shared/lib/date'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'
import { LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './AdminChatHistoryPage.module.css'

const EVENT_LABEL: Record<ChatRoomEventType, string> = {
  ROOM_CREATED: '채팅방을 만들었어요',
  MEMBER_JOINED: '들어왔어요',
  MEMBER_LEFT: '나갔어요',
  MEMBER_REJOINED: '다시 들어왔어요',
  ROOM_ENDED: '두 사람 모두 나가 채팅방이 종료됐어요',
}

/**
 * 관리자 채팅 기록. 관리자용 방 목록 API가 없어 채팅방 번호로 찾는다.
 * /admin/chats 는 찾기만, /admin/chats/:chatRoomId 는 기록까지 보여 준다.
 */
export function AdminChatHistoryPage() {
  const param = useParams().chatRoomId
  const chatRoomId = param ? Number(param) : null

  return (
    <div className="page">
      <PageHead
        title="채팅 기록"
        lede="분쟁을 판단할 때 채팅방의 전체 기록을 확인해요. 회원이 나가며 숨긴 메시지와 삭제된 메시지도 함께 보여요. 조회만 할 수 있어요."
      />
      <Lookup key={param} initial={param ?? ''} />
      {chatRoomId === null ? null : Number.isInteger(chatRoomId) &&
        chatRoomId > 0 ? (
        <History chatRoomId={chatRoomId} />
      ) : (
        <EmptyState title="채팅방 번호를 확인해 주세요">
          숫자로 된 채팅방 번호를 넣어 주세요.
        </EmptyState>
      )}
    </div>
  )
}

function Lookup({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  const navigate = useNavigate()
  const id = Number(value.trim())
  const valid = Number.isInteger(id) && id > 0

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) navigate(`/admin/chats/${id}`)
  }

  return (
    <form className={`panel ${styles.lookup}`} role="search" onSubmit={submit}>
      <div className="field">
        <label htmlFor="chat-room-id">채팅방 번호</label>
        <input
          id="chat-room-id"
          className="input"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <button type="submit" className="btn primary" disabled={!valid}>
        조회
      </button>
    </form>
  )
}

function History({ chatRoomId }: { chatRoomId: number }) {
  const { data, error, isPending, refetch } = useQuery(
    chatHistoryQuery(chatRoomId),
  )
  if (isPending) return <Loading />
  if (isApiError(error, 'CHAT_ROOM_NOT_FOUND'))
    return (
      <EmptyState title="채팅방을 찾을 수 없어요">
        채팅방 번호를 다시 확인해 주세요.
      </EmptyState>
    )
  if (error) return <LoadError error={error} retry={refetch} />
  return <HistoryView history={data} />
}

type Entry =
  | { kind: 'message'; at: string; message: ChatHistoryMessage }
  | { kind: 'log'; at: string; log: ChatRoomLog }

/** 메시지와 입장·퇴장 기록을 시간순으로 합친다(같은 시각이면 기록 먼저). */
function mergeTimeline(history: ChatRoomHistory): Entry[] {
  const entries: Entry[] = [
    ...history.logs.map((log) => ({
      kind: 'log' as const,
      at: log.occurredAt,
      log,
    })),
    ...history.messages.map((message) => ({
      kind: 'message' as const,
      at: message.sentAt,
      message,
    })),
  ]
  const time = (e: Entry) => parseServerDate(e.at).getTime()
  return entries.sort(
    (a, b) =>
      time(a) - time(b) || (a.kind === b.kind ? 0 : a.kind === 'log' ? -1 : 1),
  )
}

function HistoryView({ history }: { history: ChatRoomHistory }) {
  const nickname = (userId: number | null) =>
    userId === null
      ? '시스템'
      : (history.members.find((m) => m.userId === userId)?.nickname ??
        `회원 ${userId}`)
  const timeline = mergeTimeline(history)

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>채팅방 #{history.chatRoomId}</h2>
          {history.status === 'ACTIVE' ? (
            <span className="pill ok">진행 중</span>
          ) : (
            <span className="pill mute">종료</span>
          )}
        </div>
        <dl className="kv">
          <dt>만든 시각</dt>
          <dd>{formatDateTime(history.createdAt)}</dd>
          {history.endedAt && (
            <>
              <dt>종료 시각</dt>
              <dd>{formatDateTime(history.endedAt)}</dd>
            </>
          )}
          <dt>참여자</dt>
          <dd>
            {history.members.map((m, i) => (
              <span key={m.userId}>
                {i > 0 && ', '}
                {m.nickname} (회원 #{m.userId}){!m.active && ' · 나감'}
              </span>
            ))}
          </dd>
          <dt>메시지</dt>
          <dd className="num">{history.messages.length}개</dd>
        </dl>
      </section>
      {timeline.length === 0 ? (
        <EmptyState title="아직 주고받은 메시지가 없어요" />
      ) : (
        <ol className={`panel ${styles.timeline}`} aria-label="채팅 기록">
          {timeline.map((e) =>
            e.kind === 'log' ? (
              <li
                key={`log-${e.log.logId}`}
                className={`${styles.item} ${styles.event}`}
              >
                {formatDateTime(e.at)} ·{' '}
                {e.log.eventType === 'ROOM_ENDED'
                  ? EVENT_LABEL.ROOM_ENDED
                  : `${nickname(e.log.actorUserId)}님이 ${EVENT_LABEL[e.log.eventType]}`}
              </li>
            ) : (
              <MessageItem
                key={`msg-${e.message.messageId}`}
                message={e.message}
                sender={nickname(e.message.senderUserId)}
              />
            ),
          )}
        </ol>
      )}
    </>
  )
}

function MessageItem({
  message,
  sender,
}: {
  message: ChatHistoryMessage
  sender: string
}) {
  if (message.messageType === 'SYSTEM')
    return (
      <li className={`${styles.item} ${styles.event}`}>
        {formatDateTime(message.sentAt)} · {message.content}
      </li>
    )
  const deleted = message.deletedAt !== null
  return (
    <li className={deleted ? `${styles.item} ${styles.deleted}` : styles.item}>
      <div className={styles.head}>
        <b>{sender}</b>
        <span className="fine num">{formatDateTime(message.sentAt)}</span>
        <span className="fine num">#{message.roomSequence}</span>
        {deleted && (
          <span className="pill bad">
            삭제됨 · {formatDateTime(message.deletedAt!)}
          </span>
        )}
      </div>
      <p className={styles.text}>{message.content}</p>
    </li>
  )
}
