import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { lookup } from '@/shared/lib/statusLabel'
import type { ProcessingStatus } from '../types'

/** 처리 상태 안내. 정상 처리 중은 상태 배지로 충분해서 안내하지 않는다 */
const NOTE: Record<ProcessingStatus, ReactNode> = {
  PROCESSING: null,
  DELAYED: (
    <p className="fine">
      처리가 늦어지고 있어요. 자동으로 다시 시도하고 있어요.
    </p>
  ),
  ACTION_REQUIRED: (
    <p className="fine c-bad">
      자동 처리가 멈춰 관리자가 확인하고 있어요. 급하면{' '}
      <Link to="/support">고객센터</Link>로 문의해 주세요.
    </p>
  ),
}

/** 처리 중인 주문·항목의 지연·멈춤 안내. 처리 중이 아니거나 모르는 값이면 숨긴다 */
export function ProcessingNote({
  status,
}: {
  status: ProcessingStatus | null
}) {
  return lookup(NOTE, status) ?? null
}
