import type { AppearanceRequestStatus, AppearanceStatus } from '../types'
import styles from './HpLocation.module.css'

type Tone = 'hold' | 'earn' | 'back'
type Location = [Tone, string]

/** 출연 상태에서 출연료가 지금 어디에 있는지. 모르는 상태면 표시하지 않는다 */
function ofAppearance(status: AppearanceStatus): Location | null {
  switch (status) {
    case 'ESTABLISHED':
    case 'CANCEL_REQUESTED':
      return ['hold', '보류 중']
    case 'CONFIRMED':
      return ['earn', '게스트에게 지급']
    case 'ABSENT':
    case 'CANCELED_BY_AGREEMENT':
      return ['back', '호스트에게 반환']
    case 'CANCELED_BY_HOST':
      return ['back', '위약금 정산']
    default:
      return null
  }
}

/** 요청서 상태에서 출연료가 지금 어디에 있는지. 보류 확인 중·실패·끝난 요청은 표시하지 않는다 */
function ofRequest(status: AppearanceRequestStatus): Location | null {
  switch (status) {
    case 'REQUESTED':
      return ['hold', '보류 중']
    default:
      return null
  }
}

/**
 * 출연료 옆의 작은 표시(보류=호박색, 지급=초록). 상태 배지가 같은 뜻을 글자로 이미 말하므로 화면 낭독기에는 숨긴다.
 */
export function HpLocation(
  props:
    | { appearance: AppearanceStatus; request?: never }
    | { request: AppearanceRequestStatus; appearance?: never },
) {
  const location =
    props.appearance !== undefined
      ? ofAppearance(props.appearance)
      : ofRequest(props.request)
  if (!location) return null
  const [tone, label] = location
  return (
    <span className={`${styles.tag} ${styles[tone]}`} aria-hidden="true">
      <span className={styles.dot} />
      {label}
    </span>
  )
}
