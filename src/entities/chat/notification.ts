import { formatDateTime, parseServerDate } from '@/shared/lib/date'
import { formatNumber } from '@/shared/lib/money'
import type {
  ChatMessageType,
  NotificationFields,
  NotificationValues,
} from './types'

/** 알림이 가리키는 출연 건 화면. 이동할 곳을 모르면 null */
export function notificationLink({
  notificationKind,
  referenceId,
  parentReferenceId,
}: NotificationFields): { to: string; label: string } | null {
  if (notificationKind === 'APPEARANCE_REQUEST_SENT' && referenceId)
    return { to: `/appearances/requests/${referenceId}`, label: '요청서 보기' }
  // 지원 ID로 여는 화면이 없어 모집글로 보낸다.
  if (
    notificationKind === 'APPEARANCE_APPLICATION_SUBMITTED' &&
    parentReferenceId
  )
    return { to: `/recruits/${parentReferenceId}`, label: '모집글 보기' }
  return null
}

/** 알림 문구: 제목(첫 줄)과 내용 줄 */
export type NotificationText = { title: string; lines: string[] }

/** 템플릿이 아는 값 형식 버전 */
const DATA_VERSION = 1

type Data = NotificationValues

const text = (data: Data, key: string) =>
  typeof data[key] === 'string' ? (data[key] as string) : undefined

const number = (data: Data, key: string) =>
  typeof data[key] === 'number' && Number.isFinite(data[key])
    ? (data[key] as number)
    : undefined

/** 오프셋 없는 KST 일시('yyyy-MM-ddTHH:mm:ss')를 앱 형식으로. 형식이 다르거나 없는 날짜면 undefined */
const dateTime = (data: Data, key: string) => {
  const value = text(data, key)
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value))
    return undefined
  return Number.isNaN(parseServerDate(value).getTime())
    ? undefined
    : formatDateTime(value)
}

/** 회원 ID 목록. 하나라도 숫자가 아니면 undefined */
const ids = (data: Data, key: string) => {
  const value = data[key]
  if (!Array.isArray(value) || value.length === 0) return undefined
  return value.every((id) => typeof id === 'number' && Number.isFinite(id))
    ? (value as number[])
    : undefined
}

/**
 * 안내에 나오는 회원 이름. 서버는 회원 ID만 남기므로 화면이 아는 이름(참여자 목록 등)으로 바꾼다.
 * 모르는 회원(나간 회원 등)은 undefined를 돌려주면 '회원 {ID}'로 쓴다
 */
export type NameOf = (userId: number) => string | undefined

const nameWith = (nameOf: NameOf | undefined) => (userId: number) =>
  nameOf?.(userId) ?? `회원 ${userId}`

/** 초대된 회원: 세 명까지 이름, 넘으면 '외 N명' */
const INVITED_NAMES_MAX = 3
function invitedNames(userIds: number[], name: (id: number) => string) {
  const shown = userIds.slice(0, INVITED_NAMES_MAX).map((id) => `${name(id)}님`)
  const rest = userIds.length - shown.length
  return rest > 0 ? `${shown.join(', ')} 외 ${rest}명` : shown.join(', ')
}

type ValueField =
  | 'appearanceRequestSent'
  | 'appearanceApplicationSubmitted'
  | 'groupMembersInvited'
  | 'groupMemberKicked'
  | 'groupMemberLeft'
  | 'groupRoomClosed'

/**
 * 알림 종류의 값 필드와 템플릿. 템플릿은 필요한 값이 없거나 형식이 다르면 null.
 * 값 필드가 없는 종류(field 없음)는 종류만으로 문구를 만든다
 */
type Template = {
  field?: ValueField
  render: (data: Data, nameOf: NameOf | undefined) => NotificationText | null
}

const line = (title: string): NotificationText => ({ title, lines: [] })

/**
 * 메시지 종류·알림 종류별 템플릿. 값은 알림 종류에 맞는 필드에서 읽는다(서버는 그 필드 하나만 채운다).
 * 메시지 종류로 나눈다. SYSTEM은 단체방 안내만 값으로 오고, 1:1 방의 나가기·재입장 안내는 아직 문구(content)로 온다
 */
const TEMPLATES: Partial<Record<ChatMessageType, Record<string, Template>>> = {
  NOTIFICATION: {
    APPEARANCE_REQUEST_SENT: {
      field: 'appearanceRequestSent',
      render: (data) => {
        const nickname = text(data, 'hostNickname')
        const title = text(data, 'title')
        const fee = number(data, 'fee')
        const scheduledAt = dateTime(data, 'scheduledAt')
        const acceptDeadline = dateTime(data, 'acceptDeadline')
        if (
          nickname === undefined ||
          title === undefined ||
          fee === undefined ||
          scheduledAt === undefined ||
          acceptDeadline === undefined
        )
          return null
        return {
          title: `${nickname}님이 출연을 요청했습니다.`,
          lines: [
            `제목: ${title}`,
            `출연료: ${formatNumber(fee)} HP`,
            `방송 예정: ${scheduledAt}`,
            `수락 기한: ${acceptDeadline}`,
          ],
        }
      },
    },
    APPEARANCE_APPLICATION_SUBMITTED: {
      field: 'appearanceApplicationSubmitted',
      render: (data) => {
        const nickname = text(data, 'guestNickname')
        const recruitTitle = text(data, 'recruitTitle')
        if (nickname === undefined || recruitTitle === undefined) return null
        return {
          title: `${nickname}님이 출연 모집에 지원했습니다.`,
          lines: [`모집글: ${recruitTitle}`],
        }
      },
    },
  },
  // 단체방 안내(Q38): 서버는 종류와 행위자·대상 회원 ID만 남긴다. 호스트의 정지·탈퇴 같은 사유는 보여 주지 않는다.
  SYSTEM: {
    GROUP_MEMBERS_INVITED: {
      field: 'groupMembersInvited',
      render: (data, nameOf) => {
        const inviter = number(data, 'inviterUserId')
        const invited = ids(data, 'invitedUserIds')
        if (inviter === undefined || invited === undefined) return null
        const name = nameWith(nameOf)
        return line(
          `${name(inviter)}님이 ${invitedNames(invited, name)}을 초대했습니다.`,
        )
      },
    },
    GROUP_MEMBER_KICKED: {
      field: 'groupMemberKicked',
      render: (data, nameOf) => {
        const host = number(data, 'kickedByUserId')
        const target = number(data, 'kickedUserId')
        if (host === undefined || target === undefined) return null
        const name = nameWith(nameOf)
        return line(`${name(host)}님이 ${name(target)}님을 내보냈습니다.`)
      },
    },
    GROUP_MEMBER_LEFT: {
      field: 'groupMemberLeft',
      render: (data, nameOf) => {
        const left = number(data, 'leftUserId')
        if (left === undefined) return null
        return line(`${nameWith(nameOf)(left)}님이 나갔습니다.`)
      },
    },
    GROUP_ROOM_CLOSED: {
      field: 'groupRoomClosed',
      render: () =>
        line('호스트가 방을 폐쇄했습니다. 이제 대화를 읽을 수만 있어요.'),
    },
    GROUP_HOST_UNAVAILABLE: {
      render: () =>
        line('호스트가 방을 운영할 수 없게 되어 읽기 전용으로 바뀌었습니다.'),
    },
    GROUP_ROOM_SUSPENDED: {
      render: () => line('호스트 사정으로 방 사용이 잠시 중지됐습니다.'),
    },
    GROUP_ROOM_RESUMED: {
      render: () => line('방 사용이 다시 시작됐습니다.'),
    },
  },
}

/** 템플릿으로 문구를 만들지 못했을 때 종류만으로 쓰는 문구(알림 종류별, 모르면 메시지 종류별) */
const GENERIC_TITLES: Partial<Record<ChatMessageType, Record<string, string>>> =
  {
    NOTIFICATION: {
      APPEARANCE_REQUEST_SENT: '출연 요청이 도착했습니다.',
      APPEARANCE_APPLICATION_SUBMITTED: '출연 모집 지원이 도착했습니다.',
    },
    SYSTEM: {
      GROUP_MEMBERS_INVITED: '새 참여자가 초대됐습니다.',
      GROUP_MEMBER_KICKED: '참여자가 내보내졌습니다.',
      GROUP_MEMBER_LEFT: '참여자가 나갔습니다.',
      GROUP_ROOM_CLOSED: '방이 폐쇄됐습니다.',
    },
  }
const GENERIC_TITLE: Partial<Record<ChatMessageType, string>> = {
  NOTIFICATION: '새 알림이 도착했습니다.',
  SYSTEM: '새 안내가 있습니다.',
}

/** 서버가 남긴 문구(첫 줄은 제목) */
function fromContent(content: string): NotificationText {
  const [title, ...lines] = content.split('\n')
  return { title, lines }
}

function isValues(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 표에서 이 종류의 값(상속된 키는 보지 않는다) */
function lookup<T>(table: Record<string, T> | undefined, key: unknown) {
  return table && typeof key === 'string' && Object.hasOwn(table, key)
    ? table[key]
    : undefined
}

/**
 * 서버가 남긴 알림·안내 메시지의 문구. 채팅방·방 목록 미리보기·관리자 기록이 모두 이것으로 그린다. 다음 순서로 고른다.
 * 1. 메시지 종류·알림 종류에 맞는 템플릿이 있고, 그 종류의 값 필드가 맞는 버전·형식이면 템플릿(모르는 키는 무시한다)
 * 2. 서버가 남긴 문구(content)가 비어 있지 않으면 그것(이전에 문구로 남긴 알림, 시스템 안내)
 * 3. 종류만으로 만든 문구(이 화면이 아직 모르는 새 종류의 값이 와서 content가 빈 경우 등)
 */
export function notificationText(
  message: NotificationFields & {
    messageType: ChatMessageType
    content: string
  },
  nameOf?: NameOf,
): NotificationText {
  const { messageType, content, notificationKind } = message
  const template = lookup(TEMPLATES[messageType], notificationKind)
  const made = !template
    ? null
    : !template.field
      ? template.render({}, nameOf)
      : (() => {
          const data = message[template.field]
          return isValues(data) && data.v === DATA_VERSION
            ? template.render(data, nameOf)
            : null
        })()
  if (made) return made
  if (content) return fromContent(content)
  return {
    title:
      lookup(GENERIC_TITLES[messageType], notificationKind) ??
      GENERIC_TITLE[messageType] ??
      GENERIC_TITLE.NOTIFICATION!,
    lines: [],
  }
}

/** 한 줄로 보여 줄 때(시스템 안내) */
export function notificationLine(
  message: Parameters<typeof notificationText>[0],
  nameOf?: NameOf,
) {
  const { title, lines } = notificationText(message, nameOf)
  return [title, ...lines].join(' ')
}

/**
 * 방 목록 미리보기 문구. 단체방 안내는 회원 이름을 모르는 곳이라(참여자를 싣지 않는다) 이름 없는 문구로 쓴다
 */
export function notificationPreview(
  message: Parameters<typeof notificationText>[0],
) {
  const { messageType, notificationKind } = message
  if (messageType === 'SYSTEM' && notificationKind?.startsWith('GROUP_')) {
    const generic = lookup(GENERIC_TITLES.SYSTEM, notificationKind)
    if (generic) return generic
  }
  return notificationText(message).title
}
