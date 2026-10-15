import type { NotificationFields } from './types'

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

/** 여러 줄 알림의 첫 줄(요약). 방 목록 미리보기에 쓴다 */
export function firstLine(content: string) {
  return content.split('\n', 1)[0]
}
