/**
 * 인증된 인플루언서 체크 표시(장식). 뜻은 곁의 등급 필이 글자로 전하므로 읽지 않게 둔다.
 * 색·크기는 부르는 쪽 CSS가 정한다(currentColor).
 */
export function VerifiedMark({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none">
        <path
          d="M3.5 8.4 6.6 11.4 12.5 4.8"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
