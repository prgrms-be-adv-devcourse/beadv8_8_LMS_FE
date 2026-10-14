import { isRouteErrorResponse, useRouteError } from 'react-router'
import { EmptyState } from '@/shared/ui/EmptyState'
import { NotFoundPage } from './NotFoundPage'

/** 화면을 그리다 실패했을 때. 앱 셸 없이 단독으로 보일 수 있어 여백을 따로 준다. */
export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404)
    return <NotFoundPage />
  if (import.meta.env.DEV) console.error(error)
  return (
    <div className="page" style={{ padding: '48px 16px' }}>
      <EmptyState
        title="문제가 생겼어요"
        action={
          <button
            type="button"
            className="btn primary"
            onClick={() => location.reload()}
          >
            다시 시도
          </button>
        }
      >
        잠시 후 다시 시도해 주세요. 계속되면 고객센터로 알려 주세요.
      </EmptyState>
    </div>
  )
}
