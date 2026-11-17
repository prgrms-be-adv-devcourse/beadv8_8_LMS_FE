import { faqCategoryName } from '../labels'
import type { Faq } from '../types'
import styles from './FaqList.module.css'

/**
 * FAQ 질문 목록. 질문을 누르면 답이 펼쳐진다(details).
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
              {showCategory && (
                <span className={styles.category}>
                  {faqCategoryName(faq.category)}
                </span>
              )}
              <span className={styles.question}>{faq.question}</span>
            </summary>
            <p className={styles.answer}>{faq.answer}</p>
          </details>
        </li>
      ))}
    </ul>
  )
}
