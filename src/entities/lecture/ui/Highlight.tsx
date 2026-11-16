import { parseHighlight } from '../highlight'
import styles from './Highlight.module.css'

/** 검색 API의 highlights 값을 그린다. 검색어가 걸린 말(<em>)만 강조하고 나머지는 글로 넣는다 */
export function Highlight({ html }: { html: string }) {
  return parseHighlight(html).map((part, i) =>
    part.hit ? (
      <em key={i} className={styles.hit}>
        {part.text}
      </em>
    ) : (
      part.text
    ),
  )
}
