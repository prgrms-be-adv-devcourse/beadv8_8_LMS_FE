import type { ProblemDetail } from './types'

const FALLBACK_MESSAGE: Record<number, string> = {
  401: '로그인이 필요해요.',
  403: '권한이 없어요.',
  404: '찾을 수 없어요.',
}

/**
 * API 실패. 화면 분기는 code로만 한다.
 * Security 필터에서 막힌 401·403은 본문이 없어 code가 HTTP 상태 이름(UNAUTHORIZED 등)으로 채워진다.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly errors: { field: string; message: string }[]

  constructor(status: number, body: ProblemDetail | null) {
    super(
      body?.detail ??
        FALLBACK_MESSAGE[status] ??
        '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
    )
    this.name = 'ApiError'
    this.status = status
    this.code = body?.code ?? statusCode(status)
    this.errors = body?.errors ?? []
  }
}

function statusCode(status: number): string {
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  return status >= 500 ? 'INTERNAL_ERROR' : `HTTP_${status}`
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return (
    error instanceof ApiError && (code === undefined || error.code === code)
  )
}
