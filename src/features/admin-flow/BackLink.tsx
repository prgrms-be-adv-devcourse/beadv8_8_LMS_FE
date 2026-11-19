import { Link } from 'react-router'

/** 상세 위의 '← 목록' 링크 */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link className="back" to={to}>
      ← {label}
    </Link>
  )
}
