import { Link, useNavigate } from 'react-router'
import { SignalScreen } from './SignalScreen'

/** 이 앱 안에서 다른 화면을 거쳐 왔는지(브라우저 라우터가 history.state에 넣는 순번). 주소를 직접 열었으면 0이다. */
function canGoBack() {
  const state = window.history.state as { idx?: number } | null
  return (state?.idx ?? 0) > 0
}

export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="page">
      <SignalScreen
        code="404"
        bigCode
        screenLabel="NO SIGNAL"
        title="페이지를 찾을 수 없어요"
        actions={
          <>
            <Link className="btn primary" to="/">
              처음으로
            </Link>
            {canGoBack() && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => navigate(-1)}
              >
                이전으로
              </button>
            )}
          </>
        }
      >
        주소가 바뀌었거나 없어진 페이지예요.
      </SignalScreen>
    </div>
  )
}
