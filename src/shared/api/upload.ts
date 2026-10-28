import { ApiError } from './ApiError'
import { API_BASE, CSRF_HEADER, ensureCsrfToken } from './client'
import type { ProblemDetail } from './types'

export type UploadOptions = {
  /** 파일 정보를 등록할 때 보낸 형식. BE가 Content-Type과 비교한다 */
  contentType: string
  /** 0~1 */
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}

/**
 * 파일 본문을 그대로(multipart가 아님) PUT으로 올린다. 성공하면 resolve, 실패하면 ApiError를 던진다.
 * fetch는 업로드 진행률을 받을 수 없어 XMLHttpRequest를 쓴다. CSRF 헤더는 api()와 같이 붙인다.
 * signal로 중단하면 AbortError(DOMException)를 던진다.
 */
export async function uploadBody(
  path: string,
  file: Blob,
  { contentType, onProgress, signal }: UploadOptions,
): Promise<void> {
  const token = await ensureCsrfToken()
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `${API_BASE}${path}`)
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader('Content-Type', contentType)
    if (token) xhr.setRequestHeader(CSRF_HEADER, token)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      reject(new ApiError(xhr.status, readProblem(xhr)))
    }
    const networkError = () =>
      reject(new ApiError(0, { status: 0, code: 'NETWORK_ERROR' }))
    xhr.onerror = networkError
    xhr.ontimeout = networkError
    xhr.onabort = () => reject(abortError())
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })

    xhr.send(file)
  })
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function abortError() {
  return new DOMException('업로드를 취소했어요.', 'AbortError')
}

function readProblem(xhr: XMLHttpRequest): ProblemDetail | null {
  const type = xhr.getResponseHeader('Content-Type') ?? ''
  if (!type.includes('json')) return null
  try {
    return JSON.parse(xhr.responseText) as ProblemDetail
  } catch {
    return null
  }
}
