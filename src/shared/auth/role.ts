/** BE member Role */
export type Role = 'USER' | 'INFLUENCER' | 'VERIFIED_INFLUENCER' | 'ADMIN'

/** 화면 권한 판단용. 세션이 없으면 GUEST(비회원) */
export type Viewer = Role | 'GUEST'

export const VIEWER_LABEL: Record<Viewer, string> = {
  GUEST: '비회원',
  USER: '유저',
  INFLUENCER: '인플루언서',
  VERIFIED_INFLUENCER: '인증된 인플루언서',
  ADMIN: '관리자',
}

// 메뉴·라우트 권한에 자주 쓰는 묶음 (BE AGENTS.md 6장 권한표)
export const ALL: Viewer[] = [
  'GUEST',
  'USER',
  'INFLUENCER',
  'VERIFIED_INFLUENCER',
  'ADMIN',
]
/** 회원(관리자 제외): 구매·지갑·고객센터 */
export const MEMBER: Viewer[] = ['USER', 'INFLUENCER', 'VERIFIED_INFLUENCER']
/** 로그인한 모든 회원 */
export const SIGNED_IN: Viewer[] = [...MEMBER, 'ADMIN']
/** 출연·환전 */
export const INFLUENCER: Viewer[] = ['INFLUENCER', 'VERIFIED_INFLUENCER']
export const ADMIN: Viewer[] = ['ADMIN']

/** 역할별 첫 화면 */
export function homePathOf(viewer: Viewer): string {
  if (viewer === 'ADMIN') return '/admin'
  return '/'
}

/** roles가 없으면 누구나 접근할 수 있다. */
export function canAccess(
  viewer: Viewer,
  roles: readonly Viewer[] | undefined,
): boolean {
  return !roles || roles.includes(viewer)
}
