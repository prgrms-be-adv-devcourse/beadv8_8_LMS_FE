import { Link } from 'react-router'
import { formatDate } from '@/shared/lib/date'
import type { InquirySummary } from '../types'
import { CategoryPill, InquiryStatusPill } from './InquiryPills'

type Props = {
  inquiries: InquirySummary[]
  to: (inquiryId: number) => string
  /** 관리자 목록은 문의한 회원 번호를 함께 보여 준다 */
  showUser?: boolean
}

export function InquiryList({ inquiries, to, showUser }: Props) {
  return (
    <ul className="rows" aria-label="문의 목록">
      {inquiries.map((q) => (
        <li key={q.inquiryId} className="row-item">
          <Link
            to={to(q.inquiryId)}
            className="row-main"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            <span
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <CategoryPill category={q.category} />
              <span className="fine">
                {showUser && `회원 #${q.userId} · `}
                {formatDate(q.createdAt)}
              </span>
            </span>
            <span className="row-title">{q.title}</span>
          </Link>
          <InquiryStatusPill status={q.status} />
        </li>
      ))}
    </ul>
  )
}
