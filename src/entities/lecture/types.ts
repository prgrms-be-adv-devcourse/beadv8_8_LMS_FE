/** 강의 검수 상태. 판매 중(ON_SALE)인 강의만 담고 살 수 있다. */
export type LectureStatus = 'PENDING_INSPECTION' | 'REJECTED' | 'ON_SALE'

/** 목록 정렬. RATING은 BE 리뷰 구현 전까지 최신순과 같다. */
export type LectureSort = 'LATEST' | 'PRICE_ASC' | 'PRICE_DESC' | 'RATING'

export type ContentType = 'VIDEO' | 'DOCUMENT'

/** GET /lectures 한 줄 (판매 중 강의만) */
export type LectureSummary = {
  lectureId: number
  title: string
  priceHp: number
  /** Presigned GET, 1시간 유효 */
  thumbnailUrl: string | null
  sellerUserId: number
  sellerNickname: string
  averageRating: number | null
  reviewCount: number
}

export type LectureContent = {
  contentId: number
  title: string
  sequence: number
  contentType: ContentType
}

/** GET /lectures/{lectureId} */
export type LectureDetail = {
  lectureId: number
  sellerUserId: number
  sellerNickname: string
  title: string
  description: string
  priceHp: number
  thumbnailUrl: string | null
  status: LectureStatus
  /** 판매자·관리자에게만 */
  rejectionReason: string | null
  /** 삭제된 강의. 판매자·관리자·보유 중인 구매자만 조회할 수 있다 */
  deleted: boolean
  averageRating: number | null
  reviewCount: number
  contents: LectureContent[]
  createdAt: string
}

/** GET /lectures/{lectureId}/contents/{contentId}/access */
export type ContentAccess = {
  /** S3 Presigned GET URL. 저장하거나 공유하지 않는다 */
  url: string
  expiresAt: string
}

/** GET /lectures/{lectureId}/reviews 한 줄 */
export type Review = {
  reviewId: number
  reviewerUserId: number
  reviewerNickname: string
  rating: number
  content: string | null
  createdAt: string
  updatedAt: string
}

export const LECTURE_SORT_LABEL: Record<LectureSort, string> = {
  LATEST: '최신순',
  RATING: '평점순',
  PRICE_ASC: '낮은 가격순',
  PRICE_DESC: '높은 가격순',
}
