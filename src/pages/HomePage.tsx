import { Navigate } from 'react-router'
import { homePathOf } from '@/shared/auth/role'
import { useViewer } from '@/shared/auth/session'
import { PlaceholderPage } from './PlaceholderPage'

/** 홈은 회원(유저·인플루언서) 화면이다. 비회원은 강의 목록, 관리자는 운영 대시보드로 보낸다. */
export function HomePage() {
  const viewer = useViewer()
  if (!viewer) return null
  if (viewer === 'GUEST' || viewer === 'ADMIN')
    return <Navigate to={homePathOf(viewer)} replace />
  return <PlaceholderPage />
}
