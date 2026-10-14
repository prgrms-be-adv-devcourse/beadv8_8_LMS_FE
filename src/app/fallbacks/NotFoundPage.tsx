import { Link } from 'react-router'
import { EmptyState } from '@/shared/ui/EmptyState'

export function NotFoundPage() {
  return (
    <div className="page">
      <EmptyState
        title="페이지를 찾을 수 없어요"
        action={
          <Link className="btn primary" to="/">
            처음으로
          </Link>
        }
      >
        주소가 바뀌었거나 없어진 페이지예요.
      </EmptyState>
    </div>
  )
}
