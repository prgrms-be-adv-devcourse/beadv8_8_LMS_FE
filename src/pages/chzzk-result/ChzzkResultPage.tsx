import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { memberKeys } from '@/entities/member/api'
import { meQuery } from '@/shared/auth/me'
import { Loading } from '@/shared/ui/QueryState'

/**
 * 치지직 연동 콜백 뒤 BE가 보내는 화면: /mypage?chzzk=approved|registered|failed&code=
 * 승인되면 역할이 인플루언서로 바뀌므로 내 정보를 다시 불러온 뒤, 결과와 함께 채널 인증 화면으로 보낸다.
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
