import { faqCategoryName } from '../labels'
import type { Faq } from '../types'
import styles from './FaqList.module.css'

/**
 * FAQ 질문 목록. 질문을 누르면 답이 펼쳐진다(details: 키보드·낭독기 동작을 브라우저가 맡는다).
 * showCategory면 질문마다 분류 이름을 붙인다(전체 보기). 모르는 분류는 '알 수 없음'이다.
 */
export function FaqList({
  faqs,
  showCategory,
}: {
  faqs: readonly Faq[]
  showCategory: boolean
}) {
  return (
    <ul className={styles.list}>
      {faqs.map((faq) => (
        <li key={faq.code}>
          <details className={styles.item}>
            <summary>
              <span className={styles.mark} aria-hidden="true">
                Q
              </span>
              <span className={styles.head}>
                {showCategory && (
                  <span className={styles.category}>
                    {faqCategoryName(faq.category)}
                  </span>
                )}
                <span className={styles.question}>{faq.question}</span>
              </span>
              <svg
                className={styles.chevron}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <p className={styles.answer}>{faq.answer}</p>
          </details>
        </li>
      ))}
    </ul>
  )
}
