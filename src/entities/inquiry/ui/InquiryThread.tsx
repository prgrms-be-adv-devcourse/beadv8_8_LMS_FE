import type { ReactNode } from 'react'
import { formatDateTime } from '@/shared/lib/date'
import type { Inquiry, InquiryReply } from '../types'
import styles from './InquiryThread.module.css'

type Props = {
  inquiry: Inquiry
  /** 문의한 사람 이름표 (회원 화면은 '나') */
  author: string
  /** 답변마다 붙일 버튼 (관리자 고치기·삭제) */
  replyActions?: (reply: InquiryReply) => ReactNode
  /** 답변 자리 대신 그릴 것 (고치는 중인 답변) */
  renderReply?: (reply: InquiryReply) => ReactNode
}

/** 문의 본문 + 운영팀 답변(오래된 순) */
export function InquiryThread({
  inquiry,
  author,
  replyActions,
  renderReply,
}: Props) {
  return (
    <section className={`panel ${styles.thread}`} aria-label="문의 내용">
      <div className={styles.msg}>
        <div className={styles.head}>
          <b>{author}</b>
          <span className="fine num">{formatDateTime(inquiry.createdAt)}</span>
        </div>
        <p className={styles.text}>{inquiry.content}</p>
      </div>
      {inquiry.replies.map((reply) => (
        <article
          key={reply.replyId}
          className={`${styles.msg} ${styles.admin}`}
          aria-label="운영팀 답변"
        >
          <div className={styles.head}>
            <b>합방 운영팀</b>
            <span className="fine num">{formatDateTime(reply.createdAt)}</span>
            <span className={styles.spacer} />
            {replyActions?.(reply)}
          </div>
          {renderReply?.(reply) ?? (
            <p className={styles.text}>{reply.content}</p>
          )}
        </article>
      ))}
    </section>
  )
}
