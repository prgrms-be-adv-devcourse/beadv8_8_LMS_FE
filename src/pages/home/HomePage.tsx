import { Navigate } from 'react-router'
import { homePathOf } from '@/shared/auth/role'
import { useViewer } from '@/shared/auth/session'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHead } from '@/shared/ui/PageHead'

/** 홈은 회원(유저·인플루언서) 화면이다. 비회원은 강의 목록, 관리자는 운영 대시보드로 보낸다. */
export function HomePage() {
  const viewer = useViewer()
  if (!viewer) return null
  if (viewer === 'GUEST' || viewer === 'ADMIN')
    return <Navigate to={homePathOf(viewer)} replace />
  // TODO: 홈 화면 (유저: HP·이어 보기 / 인플루언서: 오늘 할 일·다가오는 방송)
  return (
    <div className="page">
      <PageHead title="홈" />
      <EmptyState title="준비 중인 화면이에요">
        곧 이 자리에 화면이 들어와요.
      </EmptyState>
    </div>
  )
}
