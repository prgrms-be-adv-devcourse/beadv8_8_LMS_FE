import { Link } from 'react-router'
import { firstLine, notificationLink } from '../notification'
import type { NotificationFields } from '../types'
import styles from './NotificationCard.module.css'

type Props = NotificationFields & {
  content: string
  /** 보낸 시각 표시(형식은 화면마다 다르다) */
  time: string
  dateTime: string
}

/** 출연 알림 메시지. 첫 줄은 제목, 나머지는 내용으로 보여 주고 출연 건으로 가는 링크를 단다 */
export function NotificationCard({
  content,
  time,
  dateTime,
  ...fields
}: Props) {
  const title = firstLine(content)
  const rest = content.slice(title.length).replace(/^\n/, '')
  const link = notificationLink(fields)
  return (
    <article className={styles.card} aria-label="출연 알림">
      <b className={styles.title}>{title}</b>
      {rest && <p className={styles.body}>{rest}</p>}
      <div className={styles.foot}>
        {link && (
          <Link className="btn sm" to={link.to}>
            {link.label}
          </Link>
        )}
        <time dateTime={dateTime}>{time}</time>
      </div>
    </article>
  )
}
