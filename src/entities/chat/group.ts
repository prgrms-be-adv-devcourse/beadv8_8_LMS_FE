import { formatDateTime, parseServerDate } from '@/shared/lib/date'
import { lookup, UNKNOWN_STATUS_NAME } from '@/shared/lib/statusLabel'
import type {
  ChatGroupSummary,
  ChatInviteFailure,
  ChatRoom,
  ChatRoomStatus,
} from './types'

/** 단체방 상태 이름(배지·배너) */
export const GROUP_STATUS_LABEL: Record<ChatRoomStatus, string> = {
  ACTIVE: '사용 중',
  SUSPENDED: '일시 중지',
  READ_ONLY: '읽기 전용',
  EXPIRED: '조회 기간 끝남',
  ENDED: '종료',
}

/** 단체방 상태 이름. 모르는 상태도 이름으로 */
export function groupStatusLabel(status: ChatRoomStatus) {
  return lookup(GROUP_STATUS_LABEL, status) ?? UNKNOWN_STATUS_NAME
}

/** 한 번에 초대할 수 있는 회원 수(BE 기본값, 넘으면 400 INVALID_REQUEST) */
export const INVITE_MAX = 50

/** 초대하지 못한 사유 */
export const INVITE_FAILURE_LABEL: Record<ChatInviteFailure, string> = {
  NOT_APPLICANT: '이 모집글에 지원한 적이 없어요',
  CHAT_NOT_ALLOWED: '지금 채팅할 수 없는 회원이에요',
  ROOM_FULL: '정원이 찼어요',
}

/** 모르는 사유도 문구로 */
export function inviteFailureLabel(reason: string | null | undefined) {
  return lookup(INVITE_FAILURE_LABEL, reason) ?? '초대하지 못했어요'
}

/**
 * 지금 상태에서 내가 할 수 있는 일. 서버가 다시 검사하므로 화면을 가리는 데만 쓴다.
 * - 사용 중: 전송, 호스트는 초대·내보내기·폐쇄
 * - 일시 중지: 조회·읽음·나가기만(호스트는 폐쇄도 할 수 있다)
 * - 읽기 전용: 조회·읽음·나가기만. 호스트는 직접 폐쇄한 방에서만 나갈 수 있다
 */
export function groupPermissions(
  room: ChatRoom & { group: ChatGroupSummary },
  myUserId: number,
) {
  const host = room.group.hostUserId === myUserId
  const active = room.status === 'ACTIVE'
  const closedByHost =
    room.status === 'READ_ONLY' && room.group.statusReason === 'CLOSED_BY_HOST'
  return {
    host,
    canSend: active,
    canInvite: host && active,
    canKick: host && active,
    canClose: host && (active || room.status === 'SUSPENDED'),
    // 호스트는 나가기 대신 폐쇄한다. 직접 폐쇄한 방에서만 나갈 수 있다.
    canLeave: host ? closedByHost : room.status !== 'EXPIRED',
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** 조회 만료까지 남은 날(올림). 이미 지났으면 0, 모르면 undefined */
export function daysUntil(expiresAt: string | null, now = Date.now()) {
  if (!expiresAt) return undefined
  const at = parseServerDate(expiresAt).getTime()
  if (Number.isNaN(at)) return undefined
  return Math.max(0, Math.ceil((at - now) / DAY_MS))
}

/** 상태 배너 문구(사용 중이면 null) */
export function groupStatusNotice(
  room: ChatRoom & { group: ChatGroupSummary },
  host: boolean,
): string | null {
  const { status, group } = room
  if (status === 'SUSPENDED')
    return '호스트 사정으로 방 사용이 잠시 중지됐어요. 대화를 읽거나 나갈 수만 있어요.'
  if (status === 'READ_ONLY') {
    const days = daysUntil(group.historyExpiresAt)
    const until =
      days === undefined
        ? ''
        : days === 0
          ? ' 곧 대화를 볼 수 없게 돼요.'
          : ` ${days}일 뒤에는 대화를 볼 수 없어요.`
    const why =
      group.statusReason === 'HOST_UNAVAILABLE'
        ? '호스트가 방을 운영할 수 없게 되어 읽기 전용이 됐어요.'
        : host
          ? '폐쇄한 방이에요. 대화를 읽거나 목록에서 나갈 수만 있어요.'
          : '호스트가 폐쇄한 방이에요. 대화를 읽거나 나갈 수만 있어요.'
    return why + until
  }
  if (status === 'EXPIRED') return '조회 기간이 끝난 방이에요.'
  return null
}

/** 읽기 전용 방을 볼 수 있는 기한 문구. 모르면 null */
export function historyUntil(group: ChatGroupSummary) {
  return group.historyExpiresAt
    ? `${formatDateTime(group.historyExpiresAt)}까지 볼 수 있어요`
    : null
}
