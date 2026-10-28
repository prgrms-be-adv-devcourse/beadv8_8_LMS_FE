import { useEffect } from 'react'
import { Navigate, Outlet, useMatches } from 'react-router'
import { canAccess, homePathOf, type Viewer } from '@/shared/auth/role'
import { useViewer } from '@/shared/auth/session'
import { EmptyState } from '@/shared/ui/EmptyState'
import { openLoginModal } from '@/shared/ui/loginModal'
import { toast } from '@/shared/ui/toastStore'
import type { RouteHandle } from '@/app/routeHandle'

/**
 * 라우트 handle.roles로 화면 접근을 막는다. UX용이며 최종 권한 판단은 BE가 한다.
 * - 비회원: 로그인 안내 + 로그인 모달
 * - 권한 없는 회원: 역할 첫 화면으로 이동
 */
export function RoleGate() {
  const viewer = useViewer()
  const roles = useRequiredRoles()

  // 루트 loader가 내 정보를 먼저 불러오므로 보통 여기서 기다리지 않는다.
  if (!viewer) return null
  if (canAccess(viewer, roles)) return <Outlet />
  if (viewer === 'GUEST') return <LoginRequired />
  return <Forbidden viewer={viewer} />
}

/** 가장 안쪽 라우트부터 roles가 있는 handle을 찾는다. */
function useRequiredRoles(): readonly Viewer[] | undefined {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i--) {
    const roles = (matches[i].handle as RouteHandle | undefined)?.roles
    if (roles) return roles
  }
  return undefined
}

function LoginRequired() {
  useEffect(() => openLoginModal('로그인하면 이용할 수 있어요.'), [])
  return (
    <div className="page">
      <EmptyState
        title="로그인이 필요해요"
        action={
          <button
            type="button"
            className="btn primary"
            onClick={() => openLoginModal()}
          >
            로그인
          </button>
        }
      >
        회원만 볼 수 있는 화면이에요.
      </EmptyState>
    </div>
  )
}

function Forbidden({ viewer }: { viewer: Viewer }) {
  useEffect(() => toast('이 화면을 볼 권한이 없어요.'), [])
  return <Navigate to={homePathOf(viewer)} replace />
}
