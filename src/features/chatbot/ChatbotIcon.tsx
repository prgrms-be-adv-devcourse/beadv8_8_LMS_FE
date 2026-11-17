/**
 * 챗봇 버튼 아이콘: 안테나가 달린 둥근 로봇 얼굴(동그란 눈, 웃는 입, 볼).
 * 목업 ICONS와 같은 규격(24 viewBox, stroke 2)으로 그렸다. 색은 currentColor 하나만 쓴다.
 */
export function ChatbotIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 안테나 */}
      <path d="M12 3.5V6" />
      <circle cx="12" cy="2.6" r="1" fill="currentColor" stroke="none" />
      {/* 얼굴 */}
      <rect x="4" y="6" width="16" height="13" rx="6" />
      {/* 귀 */}
      <path d="M2.5 11.5v2.5M21.5 11.5v2.5" />
      {/* 눈 */}
      <circle cx="9" cy="11.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="11.5" r="1.4" fill="currentColor" stroke="none" />
      {/* 웃는 입 */}
      <path d="M9.8 15a3 3 0 0 0 4.4 0" />
    </svg>
  )
}
