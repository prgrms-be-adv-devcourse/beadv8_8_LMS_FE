import type { Viewer } from '@/shared/auth/role'

/** 라우트 handle. roles가 없으면 상위 라우트의 roles를 따르고, 끝까지 없으면 누구나 접근한다. */
export type RouteHandle = {
  title?: string
  roles?: readonly Viewer[]
  /**
   * 화면 틀. 'top'이면 맨 위에 가로 메뉴가 있는 헤더를 쓰고, 왼쪽 내비는 햄버거로 여는 드로어가 된다(홈).
   * 없으면 상단 바 + 왼쪽 내비 레일.
   */
  layout?: 'top'
}
