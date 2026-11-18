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

/**
 * 문의 본문 + 운영팀 답변(오래된 순). 대화처럼 왼쪽 얼굴 표식을 세로선으로 잇고,
 * 문의한 사람은 흰 카드, 운영팀 답변은 잉크 표식과 살짝 들어간 면으로 구분한다.
 */
export function InquiryThread({
  inquiry,
  author,
  replyActions,
  renderReply,
}: Props) {
  return (
    <section className={`panel ${styles.thread}`} aria-label="문의 내용">
      <div className={styles.msg}>
        <span className={styles.avatar} aria-hidden="true">
          <PersonIcon />
        </span>
        <div className={styles.card}>
          <div className={styles.head}>
            <b>{author}</b>
            <span className={`num ${styles.time}`}>
              {formatDateTime(inquiry.createdAt)}
            </span>
          </div>
          <p className={styles.text}>{inquiry.content}</p>
        </div>
      </div>
      {inquiry.replies.map((reply) => (
        <article
          key={reply.replyId}
          className={`${styles.msg} ${styles.admin}`}
          aria-label="운영팀 답변"
        >
          <span className={styles.avatar} aria-hidden="true">
            <HeadsetIcon />
          </span>
          <div className={styles.card}>
            <div className={styles.head}>
              <b>합방 운영팀</b>
              <span className={`num ${styles.time}`}>
                {formatDateTime(reply.createdAt)}
              </span>
              <span className={styles.spacer} />
              {replyActions?.(reply)}
            </div>
            {renderReply?.(reply) ?? (
              <p className={styles.text}>{reply.content}</p>
            )}
          </div>
        </article>
      ))}
    </section>
  )
}

const ICON = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function PersonIcon() {
  return (
    <svg {...ICON}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  )
}

function HeadsetIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1zM17 20a3 3 0 0 1-3 2h-2" />
    </svg>
  )
}
