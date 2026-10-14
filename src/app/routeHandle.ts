import type { Viewer } from '@/shared/auth/role'

/** 라우트 handle. roles가 없으면 상위 라우트의 roles를 따르고, 끝까지 없으면 누구나 접근한다. */
export type RouteHandle = {
  title?: string
  roles?: readonly Viewer[]
}
