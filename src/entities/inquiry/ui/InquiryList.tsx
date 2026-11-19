import { Link } from 'react-router'
import { formatDate } from '@/shared/lib/date'
import type { InquirySummary } from '../types'
import styles from './Inquiry.module.css'
import { CategoryPill, InquiryStatusPill } from './InquiryPills'

type Props = {
  inquiries: InquirySummary[]
  to: (inquiryId: number) => string
  /** 관리자 목록은 문의한 회원 번호를 함께 보여 준다 */
  showUser?: boolean
  /** 링크에 싣는 history state. 관리자 상세가 들어온 목록(필터·쪽)으로 돌아갈 때 쓴다 */
  linkState?: unknown
}

export function InquiryList({ inquiries, to, showUser, linkState }: Props) {
  return (
    <ul className="rows" aria-label="문의 목록">
      {inquiries.map((q) => (
        <li key={q.inquiryId} className={`row-item ${styles.row}`}>
          <Link
            to={to(q.inquiryId)}
            state={linkState}
            className={`row-main ${styles.link}`}
          >
            <span className={styles.meta}>
              <CategoryPill category={q.category} />
              <span className={styles.date}>
                {showUser && `회원 #${q.userId} · `}
                {formatDate(q.createdAt)}
              </span>
            </span>
            <span className={`row-title ${styles.rowTitle}`}>{q.title}</span>
          </Link>
          <InquiryStatusPill status={q.status} />
        </li>
      ))}
    </ul>
  )
}
