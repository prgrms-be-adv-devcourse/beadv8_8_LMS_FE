import { useLocation } from 'react-router'

/**
 * 관리자 목록 → 상세 → 목록 왕복에서 들어오기 전 필터·쪽을 지킨다.
 * 목록 링크가 지금 주소를 history state(`from`)로 싣고, 상세의 돌아가기 링크와 처리 뒤 이동이 그 주소로 돌아간다.
 * 새로고침·주소 직접 입력처럼 state가 없으면 목록 기본 주소로 간다.
 */
type OriginState = { from?: unknown } | null

/** 목록 링크에 싣는 state. 지금 주소(검색어 포함)다 */
export function useListLinkState() {
  const { pathname, search } = useLocation()
  return { from: pathname + search }
}

/**
 * 돌아갈 목록 주소. state의 주소가 허락한 목록 경로(검색어 제외)일 때만 쓰고, 아니면 fallback이다.
 * 상세를 다른 상세로 옮길 때(보류 무효화 뒤 새 작업 등) 넘겨줄 수 있게 state도 함께 준다.
 */
export function useListOrigin(
  fallback: string,
  others: readonly string[] = [],
) {
  const state = useLocation().state as OriginState
  const from = state?.from
  const allowed = [fallback, ...others]
  const to =
    typeof from === 'string' && allowed.includes(from.split('?')[0])
      ? from
      : fallback
  return { to, state: { from: to } }
}
