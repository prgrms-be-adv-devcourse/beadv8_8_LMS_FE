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

/** 알림 종류의 값 필드와 템플릿. 템플릿은 필요한 값이 없거나 형식이 다르면 null */
type Template = {
  field: 'appearanceRequestSent' | 'appearanceApplicationSubmitted'
  render: (data: Data) => NotificationText | null
}

/**
 * 메시지 종류·알림 종류별 템플릿. 값은 알림 종류에 맞는 필드에서 읽는다(서버는 그 필드 하나만 채운다).
 * 시스템 안내(나가기·재입장)도 값으로 바뀔 예정이라 메시지 종류로 나눈다(필드·형식이 정해지면 SYSTEM에 더한다)
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
}

/** 템플릿으로 문구를 만들지 못했을 때 종류만으로 쓰는 문구(알림 종류별, 모르면 메시지 종류별) */
const GENERIC_TITLES: Partial<Record<ChatMessageType, Record<string, string>>> =
  {
    NOTIFICATION: {
      APPEARANCE_REQUEST_SENT: '출연 요청이 도착했습니다.',
      APPEARANCE_APPLICATION_SUBMITTED: '출연 모집 지원이 도착했습니다.',
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
): NotificationText {
  const { messageType, content, notificationKind } = message
  const template = lookup(TEMPLATES[messageType], notificationKind)
  const data = template ? message[template.field] : undefined
  const made =
    template && isValues(data) && data.v === DATA_VERSION
      ? template.render(data)
      : null
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
) {
  const { title, lines } = notificationText(message)
  return [title, ...lines].join(' ')
}
