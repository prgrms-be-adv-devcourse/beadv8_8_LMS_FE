import styles from './bubbles.module.css'

/** 대화 맨 위 인사. 대화가 아니라 history에 들어가지 않는다 */
export function Greeting() {
  return (
    <div className={styles.bot}>
      <p className={styles.bubble}>
        안녕하세요, 합방 챗봇이에요. 자주 묻는 질문을 보거나 강의·인플루언서를
        추천받고, 궁금한 것을 자유롭게 물어보세요.
      </p>
    </div>
  )
}
