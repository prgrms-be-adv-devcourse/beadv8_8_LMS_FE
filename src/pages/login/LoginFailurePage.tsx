import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { loginFailureMessage } from '@/shared/auth/loginFailure'
import { consumeReturnTo, useViewer } from '@/shared/auth/session'
import { openLoginModal, openRestorePrompt } from '@/shared/ui/loginModal'
import { Loading } from '@/shared/ui/QueryState'

/**
 * 구글 로그인에 실패하면 BE가 보내는 화면: /login?error=<코드>. 첫 화면으로 보내면서 로그인 모달에 이유를 띄운다.
 * 로그인 전에 저장한 돌아갈 경로는 쓰지 않고 버린다(다음 로그인 때 엉뚱한 화면으로 가지 않게).
 * 복구할 수 있는 탈퇴 회원이면(error=WITHDRAWN_RESTORABLE&restorableUntil=…) 복구할지 묻는다. 복구 티켓은 BE가 쿠키로
 * 준다. 복구하면 구글 로그인으로 다시 가고, 그때 로그인 전에 보던 화면으로 돌아오게 그 경로를 넘긴다.
 * 이미 로그인한 상태로 들어오면(뒤로 가기 등) 모달 없이 첫 화면으로 보낸다.
 */
export function LoginFailurePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const viewer = useViewer()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current || viewer === undefined) return
    handled.current = true
    const returnTo = consumeReturnTo()
    const error = params.get('error')
    if (viewer === 'GUEST') {
      if (error === 'WITHDRAWN_RESTORABLE')
        openRestorePrompt({
          restorableUntil: params.get('restorableUntil'),
          returnTo,
        })
      else openLoginModal(loginFailureMessage(error))
    }
    navigate('/', { replace: true })
  }, [params, navigate, viewer])

  return (
    <div className="page">
      <Loading label="로그인 결과를 확인하는 중…" />
    </div>
  )
}
