import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { isChunkLoadError } from './chunkLoad'
import { NotFoundPage } from './NotFoundPage'
import { SignalScreen } from './SignalScreen'

/**
 * 화면을 그리다 실패했을 때. 화면 하나가 실패하면 앱 셸 안에 보이고(헤더·메뉴가 남아 다른 화면으로 갈 수 있다),
 * rootLoader·앱 셸이 실패하면 앱 셸 없이 단독으로 보인다. 화면 자체가 여백을 갖고 있어 두 경우 모두 그대로 쓴다.
 */
export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404)
    return <NotFoundPage />
  if (isChunkLoadError(error)) return <NewVersionPage />
  if (import.meta.env.DEV) console.error(error)
  return (
    <div className="page">
      <SignalScreen
        code="Signal lost"
        screenLabel="SIGNAL LOST"
        tone="error"
        title="문제가 생겼어요"
        actions={
          <>
            <button
              type="button"
              className="btn primary"
              onClick={() => location.reload()}
            >
              다시 시도
            </button>
            <Link className="btn ghost" to="/">
              처음으로
            </Link>
          </>
        }
      >
        잠시 후 다시 시도해 주세요. 계속되면 고객센터로 알려 주세요.
      </SignalScreen>
    </div>
  )
}

/**
 * 화면 파일을 못 받았을 때. 처음 실패는 라우터가 이미 한 번 새로고침했으므로(reloadOnChunkError), 여기는 방금 새로고침했는데
 * 또 실패한 경우(네트워크 문제 등)다. 반복하지 않고 직접 새로고침하도록 안내한다.
 */
function NewVersionPage() {
  return (
    <div className="page">
      <SignalScreen
        code="Reconnect"
        screenLabel="RECONNECT"
        tone="standby"
        title="화면을 불러오지 못했어요"
        actions={
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
      </SignalScreen>
    </div>
  )
}
