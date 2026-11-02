import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { loginFailureMessage } from '@/shared/auth/loginFailure'
import { consumeReturnTo, useViewer } from '@/shared/auth/session'
import { openLoginModal } from '@/shared/ui/loginModal'
import { Loading } from '@/shared/ui/QueryState'

/**
 * 구글 로그인에 실패하면 BE가 보내는 화면: /login?error=<코드>. 첫 화면으로 보내면서 로그인 모달에 이유를 띄운다.
 * 로그인 전에 저장한 돌아갈 경로는 쓰지 않고 버린다(다음 로그인 때 엉뚱한 화면으로 가지 않게).
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
    consumeReturnTo()
    if (viewer === 'GUEST')
      openLoginModal(loginFailureMessage(params.get('error')))
    navigate('/', { replace: true })
  }, [params, navigate, viewer])

  return (
    <div className="page">
      <Loading label="로그인 결과를 확인하는 중…" />
    </div>
  )
}
