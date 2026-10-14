import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { memberKeys } from '@/entities/member/api'
import { meQuery } from '@/shared/auth/me'
import { Loading } from '@/shared/ui/QueryState'
import { toast } from '@/shared/ui/toastStore'

/**
 * 치지직 연동 콜백 뒤 BE가 보내는 화면: /mypage?chzzk=approved|registered|failed&code=
 * 승인되면 역할이 인플루언서로 바뀌어 채널 인증 화면을 볼 수 없으므로, 내 정보를 다시 불러온 뒤 홈으로 보낸다.
 * TODO(BE): 결과 경로가 확정되면(ApiV1MemberChannelController.RESULT_PATH) 이 라우트 경로를 맞춘다.
 */
export function ChzzkResultPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true
    const result = params.get('chzzk')
    const code = params.get('code')
    void (async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: memberKeys.myChannels() }),
      ])
      if (result === 'approved') {
        toast('채널이 승인됐어요. 이제 인플루언서예요.')
        navigate('/', { replace: true })
        return
      }
      const search = new URLSearchParams({ chzzk: result ?? 'failed' })
      if (code) search.set('code', code)
      navigate(`/verify?${search}`, { replace: true })
    })()
  }, [params, navigate, queryClient])

  return (
    <div className="page">
      <Loading label="치지직 연동 결과를 확인하는 중…" />
    </div>
  )
}
