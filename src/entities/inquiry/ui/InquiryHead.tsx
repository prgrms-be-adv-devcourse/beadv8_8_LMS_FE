import { formatDate, formatDateTime } from '@/shared/lib/date'
import type { Inquiry } from '../types'
import {
  CategoryPill,
  InquiryStatusPill,
  ObjectionResultPill,
} from './InquiryPills'

/** 문의 상세 머리: 유형·상태·접수일, 제목, 이의 제기 대상과 판단 결과 */
export function InquiryHead({
  inquiry,
  showUser,
}: {
  inquiry: Inquiry
  showUser?: boolean
}) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <CategoryPill category={inquiry.category} />
        <InquiryStatusPill status={inquiry.status} />
        {inquiry.objectionResult && (
          <ObjectionResultPill result={inquiry.objectionResult} />
        )}
        <span className="fine">
          {showUser && `회원 #${inquiry.userId} · `}
          {formatDate(inquiry.createdAt)} 접수
        </span>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>{inquiry.title}</h1>
      {inquiry.targetType === 'LECTURE_ORDER_ITEM' && (
        <div className="notice">
          이의 제기 대상 · 강의 주문 항목 #{inquiry.targetId}
          {inquiry.objectionResolvedAt &&
            ` · ${formatDateTime(inquiry.objectionResolvedAt)} 판단`}
        </div>
      )}
    </>
  )
}
