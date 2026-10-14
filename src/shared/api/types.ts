/** 성공 응답 본문 (BE global RsData) */
export type RsData<T> = {
  statusCode: number
  message: string
  data: T
}

/** 페이지 응답 (Spring PagedModel). 요청은 page(0부터)·size(최대 100)·sort */
export type PagedModel<T> = {
  content: T[]
  page: {
    size: number
    number: number
    totalElements: number
    totalPages: number
  }
}

/** 오류 응답 본문 (RFC 9457 ProblemDetail + BE 확장 필드) */
export type ProblemDetail = {
  status: number
  detail?: string
  /** 화면이 분기하는 식별자 (모듈 ErrorCode enum 이름) */
  code?: string
  /** 요청 값 오류일 때만 */
  errors?: { field: string; message: string }[]
}
