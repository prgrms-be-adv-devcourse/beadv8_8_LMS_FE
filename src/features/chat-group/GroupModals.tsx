import { useInfiniteQuery } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { chatMembersQuery, inviteCandidatesQuery } from '@/entities/chat/api'
import { INVITE_MAX, inviteFailureLabel } from '@/entities/chat/group'
import type {
  ChatGroupSummary,
  ChatInviteOutcome,
  ChatRoomMember,
} from '@/entities/chat/types'
import { HostCrown } from '@/entities/chat/ui/HostCrown'
import { Avatar } from '@/shared/ui/Avatar'
import { Modal } from '@/shared/ui/Modal'
import { InlineLoadError, LoadError, Loading } from '@/shared/ui/QueryState'
import styles from './GroupModals.module.css'
import {
  useCloseGroup,
  useInviteMembers,
  useKickMember,
} from './useGroupActions'

type GroupModalProps = {
  chatRoomId: number
  group: ChatGroupSummary
  onClose: () => void
}

/**
 * 참여자 목록(참여 순). 호스트는 사용 중인 방에서 게스트를 내보낼 수 있다(행마다 한 번 더 확인).
 * 내보낸 회원은 호스트가 다시 초대해야만 들어온다
 */
export function GroupMembersModal({
  chatRoomId,
  group,
  myUserId,
  canKick,
  onClose,
}: GroupModalProps & { myUserId: number; canKick: boolean }) {
  const {
    data,
    error,
    isPending,
    refetch,
    isFetching,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(chatMembersQuery(chatRoomId))
  const kick = useKickMember(chatRoomId)
  const [confirming, setConfirming] = useState<number | null>(null)
  const members = data?.pages.flatMap((p) => p.members) ?? []

  return (
    <Modal title={`참여자 ${group.memberCount}명`} onClose={onClose}>
      {isPending ? (
        <Loading />
      ) : !data ? (
        <LoadError error={error} retry={refetch} />
      ) : (
        <>
          {error && (
            <InlineLoadError
              title="참여자를 새로 불러오지 못했어요."
              error={error}
              retrying={isFetching}
              retry={() => void refetch()}
            />
          )}
          <ul className={styles.list} aria-label="참여자">
            {members.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                host={m.userId === group.hostUserId}
                me={m.userId === myUserId}
                kickable={
                  canKick &&
                  m.userId !== group.hostUserId &&
                  m.userId !== myUserId
                }
                confirming={confirming === m.userId}
                pending={kick.isPending}
                onAsk={() => setConfirming(m.userId)}
                onCancel={() => setConfirming(null)}
                onKick={() =>
                  kick.mutate(
                    {
                      userId: m.userId,
                      nickname: m.nickname,
                      participationVersion: m.participationVersion,
                    },
                    { onSettled: () => setConfirming(null) },
                  )
                }
              />
            ))}
          </ul>
          {hasNextPage && (
            <button
              type="button"
              className="btn ghost sm"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? '불러오는 중…' : '참여자 더 보기'}
            </button>
          )}
        </>
      )}
    </Modal>
  )
}

function MemberRow({
  member,
  host,
  me,
  kickable,
  confirming,
  pending,
  onAsk,
  onCancel,
  onKick,
}: {
  member: ChatRoomMember
  host: boolean
  me: boolean
  kickable: boolean
  confirming: boolean
  pending: boolean
  onAsk: () => void
  onCancel: () => void
  onKick: () => void
}) {
  return (
    <li className={styles.row}>
      <Avatar name={member.nickname} size={32} />
      <span className={styles.name}>
        <b>
          {member.nickname}
          {host && <HostCrown />}
          {me && <span className="tag">나</span>}
        </b>
        <span className="fine">ID {member.userId}</span>
      </span>
      {kickable &&
        (confirming ? (
          <span className={styles.confirm}>
            <span className="fine">
              내보내면 다시 초대해야만 들어올 수 있어요.
            </span>
            <button type="button" className="btn ghost sm" onClick={onCancel}>
              취소
            </button>
            <button
              type="button"
              className="btn danger sm"
              disabled={pending}
              onClick={onKick}
              aria-label={`${member.nickname} 님 내보내기 확인`}
            >
              내보내기
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={onAsk}
            aria-label={`${member.nickname} 님 내보내기`}
          >
            내보내기
          </button>
        ))}
    </li>
  )
}

/** 같은 회원을 같은 순서로 다시 보내는지 비교할 키 */
const selectionKey = (ids: number[]) => ids.join(',')

/**
 * 초대(호스트). 이 모집글에 지원한 회원을 회원 ID(정확히)·닉네임(일부)으로 찾아 여러 명을 고른다. 닉네임은 같을 수 있어
 * 결과에 회원 ID를 함께 보이고 ID로 초대한다. 초대하면 바로 참여하며 결과는 회원별로 보인다(실패한 회원은 다시 검색된다).
 * 응답을 받지 못해 같은 회원을 다시 보내면 같은 요청 ID를 써서 두 번 초대되지 않게 한다
 */
export function InviteModal({ chatRoomId, onClose }: GroupModalProps) {
  const [draft, setDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  /** 고른 회원(고른 순서). 검색어를 바꿔도 남는다 */
  const [selected, setSelected] = useState<Map<number, string>>(new Map())
  const [outcome, setOutcome] = useState<{
    results: ChatInviteOutcome[]
    names: Map<number, string>
  } | null>(null)
  const request = useRef<{ key: string; id: string } | null>(null)
  const invite = useInviteMembers(chatRoomId)
  const {
    data,
    error,
    isPending,
    refetch,
    isFetching,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(inviteCandidatesQuery(chatRoomId, keyword))
  const candidates = data?.pages.flatMap((p) => p.candidates) ?? []
  const remaining = data?.pages[0]?.remainingGuestSlots
  const full = selected.size >= INVITE_MAX

  const search = (e: FormEvent) => {
    e.preventDefault()
    setKeyword(draft.trim())
  }

  const toggle = (userId: number, nickname: string) =>
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(userId)) next.delete(userId)
      else if (next.size < INVITE_MAX) next.set(userId, nickname)
      return next
    })

  const submit = () => {
    const userIds = [...selected.keys()]
    if (userIds.length === 0) return
    const key = selectionKey(userIds)
    // 같은 회원을 다시 보내면(앞 요청의 응답을 받지 못함) 같은 요청 ID를 쓴다. 고른 회원이 바뀌면 새 초대다.
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() }
    const names = new Map(selected)
    invite.mutate(
      { requestId: request.current.id, userIds },
      {
        onSuccess: (res) => {
          if (request.current?.key === key) request.current = null
          // 보낸 회원만 고른 목록에서 뺀다(기다리는 사이 새로 고른 회원은 남긴다).
          setSelected((prev) => {
            const next = new Map(prev)
            for (const userId of userIds) next.delete(userId)
            return next
          })
          setOutcome({ results: res.results, names })
        },
      },
    )
  }

  return (
    <Modal
      title="단체방에 초대"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={selected.size === 0 || invite.isPending}
            onClick={submit}
          >
            {invite.isPending ? '초대하는 중…' : `${selected.size}명 초대`}
          </button>
        </>
      }
    >
      <p className="fine">
        이 모집글에 지원한 회원을 초대할 수 있어요. 초대하면 바로 참여하고,
        참여한 뒤의 대화만 볼 수 있어요.
        {remaining !== undefined && ` 남은 자리 ${remaining}명.`} 한 번에{' '}
        {INVITE_MAX}명까지 고를 수 있어요.
      </p>
      {invite.error && (
        <p className="notice bad" role="alert">
          {invite.error.message} 다시 누르면 같은 초대로 다시 보내요.
        </p>
      )}
      {outcome && (
        <InviteOutcome
          results={outcome.results}
          names={outcome.names}
          onDismiss={() => setOutcome(null)}
        />
      )}
      <form className={styles.search} onSubmit={search} role="search">
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="회원 ID 또는 닉네임"
          aria-label="초대할 회원 검색"
        />
        <button type="submit" className="btn">
          검색
        </button>
      </form>
      {selected.size > 0 && (
        <div className={styles.chips} aria-label="고른 회원">
          {[...selected].map(([userId, nickname]) => (
            <button
              key={userId}
              type="button"
              className="chip sm on"
              onClick={() => toggle(userId, nickname)}
              aria-label={`${nickname}(ID ${userId}) 빼기`}
            >
              {nickname} · {userId} ✕
            </button>
          ))}
        </div>
      )}
      {isPending ? (
        <Loading />
      ) : !data ? (
        <LoadError error={error} retry={refetch} />
      ) : (
        <>
          {error && (
            <InlineLoadError
              title="후보를 새로 불러오지 못했어요."
              error={error}
              retrying={isFetching}
              retry={() => void refetch()}
            />
          )}
          {candidates.length === 0 ? (
            <p className="fine">
              {keyword
                ? '검색한 회원이 없어요. 이미 참여 중인 회원은 나오지 않아요.'
                : '초대할 수 있는 지원자가 없어요.'}
            </p>
          ) : (
            <ul className={styles.list} aria-label="초대 후보">
              {candidates.map((c) => (
                <li key={c.userId}>
                  <label className="chk-row">
                    <input
                      type="checkbox"
                      checked={selected.has(c.userId)}
                      disabled={
                        !c.invitable || (full && !selected.has(c.userId))
                      }
                      onChange={() => toggle(c.userId, c.nickname)}
                    />
                    <span className={styles.name}>
                      <b>{c.nickname}</b>
                      <span className="fine">
                        ID {c.userId}
                        {!c.invitable && ` · ${inviteFailureLabel(c.reason)}`}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {hasNextPage && (
            <button
              type="button"
              className="btn ghost sm"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? '불러오는 중…' : '후보 더 보기'}
            </button>
          )}
        </>
      )}
    </Modal>
  )
}

/** 초대 결과: 참여한 회원, 이미 참여 중인 회원, 초대하지 못한 회원(사유) */
function InviteOutcome({
  results,
  names,
  onDismiss,
}: {
  results: ChatInviteOutcome[]
  names: Map<number, string>
  onDismiss: () => void
}) {
  const label = (userId: number) =>
    `${names.get(userId) ?? '회원'}(ID ${userId})`
  const joined = results.filter((r) => r.result === 'JOINED')
  const already = results.filter((r) => r.result === 'ALREADY_MEMBER')
  const failed = results.filter((r) => r.result === 'FAILED')
  return (
    <section className={styles.outcome} aria-label="초대 결과" role="status">
      {joined.length > 0 && (
        <p>
          <span className="pill ok">참여</span>{' '}
          {joined.map((r) => label(r.userId)).join(', ')}
        </p>
      )}
      {already.length > 0 && (
        <p>
          <span className="pill mute">이미 참여 중</span>{' '}
          {already.map((r) => label(r.userId)).join(', ')}
        </p>
      )}
      {failed.length > 0 && (
        <>
          <p>
            <span className="pill bad">초대하지 못함</span> 다시 검색해서 초대할
            수 있어요.
          </p>
          <ul className={styles.failed}>
            {failed.map((r) => (
              <li key={r.userId}>
                {label(r.userId)}: {inviteFailureLabel(r.reason)}
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="link" onClick={onDismiss}>
        결과 닫기
      </button>
    </section>
  )
}

/** 폐쇄 확인(호스트). 폐쇄는 되돌릴 수 없다 */
export function CloseGroupModal({
  chatRoomId,
  group,
  onClose,
}: GroupModalProps) {
  const close = useCloseGroup(chatRoomId, group.recruitId)
  return (
    <Modal
      title="단체방을 폐쇄할까요?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={close.isPending}
            onClick={() => close.mutate(undefined, { onSuccess: onClose })}
          >
            폐쇄
          </button>
        </>
      }
    >
      <p>
        폐쇄하면 방이 읽기 전용이 돼요. 누구도 새 메시지를 보내거나 초대할 수
        없고, 다시 열 수 없어요.
      </p>
      <p className="fine">
        참여자는 나가지 않는 한 30일 동안 대화를 볼 수 있어요. 모집 중이면 이
        모집글에 새 단체방을 만들 수 있어요.
      </p>
    </Modal>
  )
}
