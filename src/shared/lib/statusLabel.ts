/**
 * BE가 주는 상태·종류 값을 이름 표에서 찾는다(#183).
 * BE는 FE가 아직 모르는 값을 더할 수 있고 TypeScript 타입은 실행 중에 들어오는 새 값을 막지 못한다.
 * 표에서 바로 꺼내면(`LABEL[status]`) undefined가 나와 화면이 깨지거나 빈칸이 되므로 이 함수들을 거친다.
 */

/** 상태 배지의 [색(.pill 클래스), 이름] */
export type StatusLabel = readonly [tone: string, label: string]

/** 표에 없는 상태의 이름 */
export const UNKNOWN_STATUS_NAME = '알 수 없는 상태'

/** 표에 없는 상태의 배지. 처리 중이라는 오해를 주지 않게 중립 색으로 그린다 */
export const UNKNOWN_STATUS: StatusLabel = ['mute', UNKNOWN_STATUS_NAME]

/** 표에 없는 종류·분류(플랫폼, 작업 종류 등)의 이름 */
export const UNKNOWN_NAME = '알 수 없음'

const warned = new Set<string>()

function warnUnknown(key: unknown) {
  if (!import.meta.env.DEV || typeof key !== 'string' || warned.has(key)) return
  warned.add(key)
  console.warn(`이름 표에 없는 값이에요: ${key}`)
}

/**
 * 표에서 값을 찾는다. 없으면 undefined이고 부르는 곳이 대체 문구나 숨김을 고른다.
 * 상속된 키(constructor 등)는 보지 않는다. 개발 중에는 모르는 값마다 콘솔 경고를 한 번 한다.
 */
export function lookup<V>(
  table: Readonly<Record<string, V>>,
  key: string | null | undefined,
): V | undefined {
  if (key != null && Object.hasOwn(table, key)) return table[key]
  warnUnknown(key)
  return undefined
}

/** 상태 배지의 색과 이름. 표에 없으면 UNKNOWN_STATUS */
export function statusOf(
  table: Readonly<Record<string, StatusLabel>>,
  status: string | null | undefined,
): StatusLabel {
  return lookup(table, status) ?? UNKNOWN_STATUS
}

/** switch로 이름을 고르는 배지의 default. 경고하고 UNKNOWN_STATUS를 준다 */
export function unknownStatus(status: unknown): StatusLabel {
  warnUnknown(status)
  return UNKNOWN_STATUS
}
