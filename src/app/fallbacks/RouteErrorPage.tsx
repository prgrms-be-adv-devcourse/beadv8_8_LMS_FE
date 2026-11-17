import { isRouteErrorResponse, useRouteError } from 'react-router'
import { EmptyState } from '@/shared/ui/EmptyState'
import { isChunkLoadError } from './chunkLoad'
import { NotFoundPage } from './NotFoundPage'

/**
 * 화면을 그리다 실패했을 때. 화면 하나가 실패하면 앱 셸 안에 보이고(헤더·메뉴가 남아 다른 화면으로 갈 수 있다),
 * rootLoader·앱 셸이 실패하면 앱 셸 없이 단독으로 보인다. 단독일 때를 위해 여백을 따로 준다.
 */
export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404)
    return <NotFoundPage />
  if (isChunkLoadError(error)) return <NewVersionPage />
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

/**
 * 화면 파일을 못 받았을 때. 처음 실패는 라우터가 이미 한 번 새로고침했으므로(reloadOnChunkError), 여기는 방금 새로고침했는데
 * 또 실패한 경우(네트워크 문제 등)다. 반복하지 않고 직접 새로고침하도록 안내한다.
 */
function NewVersionPage() {
  return (
    <div className="page" style={{ padding: '48px 16px' }}>
      <EmptyState
        title="화면을 불러오지 못했어요"
        action={
          <button
            type="button"
            className="btn primary"
            onClick={() => location.reload()}
          >
            새로고침
          </button>
        }
      >
        새 버전이 나왔거나 연결이 잠시 끊겼어요. 새로고침하면 다시 불러와요.
      </EmptyState>
    </div>
  )
}
