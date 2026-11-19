import { useEffect } from 'react'
import { Link, Navigate, Outlet, useMatches } from 'react-router'
import {
  canAccess,
  homePathOf,
  viewerLabel,
  type Viewer,
} from '@/shared/auth/role'
import { useViewer } from '@/shared/auth/session'
import { EmptyState } from '@/shared/ui/EmptyState'
import { openLoginModal } from '@/shared/ui/loginModal'
import { toast } from '@/shared/ui/toastStore'
import type { RouteHandle } from '@/app/routeHandle'

/**
 * 라우트 handle.roles로 화면 접근을 막는다. UX용이며 최종 권한 판단은 BE가 한다.
 * - 비회원: 로그인 안내 + 로그인 모달
 * - 권한 없는 회원: 그 자리에서 막힌 이유와 다음 단계(채널 인증·승급 신청) 안내
 * - 권한 없는 관리자: 운영 첫 화면으로 이동
 */
export function RoleGate() {
  const viewer = useViewer()
  const roles = useRequiredRoles()

  // 루트 loader가 내 정보를 먼저 불러오므로 보통 여기서 기다리지 않는다.
  if (!viewer) return null
  if (canAccess(viewer, roles)) return <Outlet />
  if (viewer === 'GUEST') return <LoginRequired />
  if (viewer === 'ADMIN') return <AdminForbidden />
  return <Forbidden viewer={viewer} roles={roles ?? []} />
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

function AdminForbidden() {
  useEffect(() => toast('이 화면을 볼 권한이 없어요.'), [])
  return <Navigate to={homePathOf('ADMIN')} replace />
}

type NextStep = { to: string; label: string; desc: string }

/** 화면을 쓸 수 있는 가장 낮은 역할 이름. 인플루언서 화면은 인증된 인플루언서도 쓴다 */
function requiredLabel(roles: readonly Viewer[]) {
  if (roles.includes('USER')) return '유저만'
  if (roles.includes('INFLUENCER')) return '인플루언서부터'
  if (roles.includes('VERIFIED_INFLUENCER')) return '인증된 인플루언서만'
  return '관리자만'
}

/** 지금 역할에서 이 화면을 쓰려면 할 일. 역할을 올려도 쓸 수 없는 화면(관리자 화면)이면 null */
function nextStep(viewer: Viewer, roles: readonly Viewer[]): NextStep | null {
  const forInfluencer =
    roles.includes('INFLUENCER') || roles.includes('VERIFIED_INFLUENCER')
  if (viewer === 'USER' && forInfluencer)
    return {
      to: '/verify',
      label: '채널 인증하기',
      desc: '방송 채널을 인증하면 인플루언서가 돼요.',
    }
  if (viewer === 'INFLUENCER' && roles.includes('VERIFIED_INFLUENCER'))
    return {
      to: '/promote',
      label: '승급 신청하기',
      desc: '승급을 신청해 관리자 승인을 받으면 인증된 인플루언서가 돼요.',
    }
  return null
}

/** 권한 없는 회원. 홈으로 보내지 않고 그 자리에서 왜 막혔는지와 다음 단계를 안내한다 */
function Forbidden({
  viewer,
  roles,
}: {
  viewer: Viewer
  roles: readonly Viewer[]
}) {
  const next = nextStep(viewer, roles)
  return (
    <div className="page">
      <EmptyState
        art="none"
        title={`${requiredLabel(roles)} 쓸 수 있는 화면이에요`}
        action={
          next ? (
            <Link className="btn primary" to={next.to}>
              {next.label}
            </Link>
          ) : (
            <Link className="btn" to={homePathOf(viewer)}>
              홈으로
            </Link>
          )
        }
      >
        지금은 {viewerLabel(viewer)} 계정이에요.{next && ` ${next.desc}`}
      </EmptyState>
    </div>
  )
}
