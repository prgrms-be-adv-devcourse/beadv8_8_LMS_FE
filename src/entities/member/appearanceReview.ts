import { lookup, UNKNOWN_NAME } from '@/shared/lib/statusLabel'
import type { RevieweeRole } from './types'

const REVIEWEE_ROLE_LABEL: Record<RevieweeRole, string> = {
  HOST: '호스트로 받음',
  GUEST: '게스트로 받음',
}

/** 받은 출연 리뷰가 어느 역할로 받은 것인지. BE가 새 역할을 더하면 알 수 없음 */
export function revieweeRoleLabel(role: RevieweeRole): string {
  return lookup(REVIEWEE_ROLE_LABEL, role) ?? UNKNOWN_NAME
}
