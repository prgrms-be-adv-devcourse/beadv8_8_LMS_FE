import type { Viewer } from '@/shared/auth/role'
import { lookup } from '@/shared/lib/statusLabel'
import type { NotificationItem } from './types'

/**
 * 알림을 눌렀을 때 갈 화면. 기준은 BE `docs/api/notification.md` 2.2 이동 대상과 `notification-catalog.md`다.
 * BE가 새 targetType·kind를 더할 수 있으므로 표에서 바로 꺼내지 않고 lookup을 거친다. 표에 없으면 이동하지 않는다.
 */

type ToPath = (targetId: string, kind: string, viewer: Viewer) => string | null

/** ID로 가는 화면. targetId가 비어 있으면 이동하지 않는다 */
const withId =
  (to: (id: string) => string): ToPath =>
  (targetId) =>
    targetId ? to(encodeURIComponent(targetId)) : null

/** targetType → 경로 */
const BY_TARGET: Readonly<Record<string, ToPath>> = {
  APPEARANCE_REQUEST: withId((id) => `/appearances/requests/${id}`),
  APPEARANCE_RECRUIT: withId((id) => `/recruits/${id}`),
  APPEARANCE: withId((id) => `/appearances/${id}`),
  // 충전·환불·환전은 건별 상세 화면이 없어 지갑으로 보낸다.
  CHARGE: () => '/wallet',
  REFUND_REQUEST: () => '/wallet',
  EXCHANGE: () => '/wallet',
  // 검수 승인·반려. 내 강의 목록에 상태와 반려 사유가 있다.
  LECTURE: () => '/studio',
  // 구매 완료·결제 실패. 주문 결과 화면이 두 경우를 모두 보여 준다.
  LECTURE_ORDER: withId((id) => `/library/orders/${id}/done`),
  // targetId는 주문 항목 ID인데 항목 화면이 없어 목록으로 보낸다.
  LECTURE_ORDER_ITEM: (_, kind, viewer) => orderItemPath(kind, viewer),
  INQUIRY: withId((id) => `/support/inquiries/${id}`),
  CHAT_ROOM: withId((id) => `/chat/${id}`),
}

/** 주문 항목 알림을 받는 쪽. BOTH는 구매자·판매자가 같은 targetType·ID를 받아 알림만으로는 어느 쪽인지 모른다 */
type OrderItemReceiver = 'BUYER' | 'SELLER' | 'BOTH'

const ORDER_ITEM_RECEIVER: Readonly<Record<string, OrderItemReceiver>> = {
  LECTURE_ORDER_ITEM_CANCELED: 'BUYER',
  LECTURE_ORDER_ITEM_CONFIRMED: 'BUYER',
  LECTURE_ORDER_ITEM_CONFIRMING: 'BUYER',
  LECTURE_OBJECTION_RETURN_COMPLETED: 'BUYER',
  LECTURE_OBJECTION_RETURN_ACTION_REQUIRED: 'BUYER',
  LECTURE_OBJECTION_WITHDRAWN: 'SELLER',
  LECTURE_OBJECTION_FILED: 'BOTH',
  LECTURE_OBJECTION_RESOLVED: 'BOTH',
}

/**
 * 주문 항목 알림. 항목 화면이 없어 구매자는 주문 내역, 판매자는 강의 판매로 보낸다.
 * 구매자·판매자 둘 다 받는 종류는 판매자가 될 수 없는 역할(유저·인플루언서)만 주문 내역으로 보내고,
 * 인증된 인플루언서는 틀린 화면으로 보내지 않게 이동하지 않는다(BE에 판매자 쪽 구분을 요청할지 정하기 전까지).
 */
function orderItemPath(kind: string, viewer: Viewer): string | null {
  switch (lookup(ORDER_ITEM_RECEIVER, kind)) {
    case 'BUYER':
      return '/library/orders'
    case 'SELLER':
      return '/studio'
    case 'BOTH':
      return viewer === 'USER' || viewer === 'INFLUENCER'
        ? '/library/orders'
        : null
    default:
      return null
  }
}

/** 알림을 눌렀을 때 갈 경로. 갈 곳이 없거나 모르는 값이면 null(읽음만 하고 머문다) */
export function notificationPath(
  { kind, targetType, targetId }: NotificationItem,
  viewer: Viewer,
): string | null {
  const toPath = lookup(BY_TARGET, targetType)
  return toPath ? toPath(targetId ?? '', kind, viewer) : null
}
