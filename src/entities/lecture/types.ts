import type { ObjectionStatus, OrderItemStatus } from '@/entities/order/types'

/** 강의 검수 상태. 판매 중(ON_SALE)인 강의만 담고 살 수 있다. */
export type LectureStatus = 'PENDING_INSPECTION' | 'REJECTED' | 'ON_SALE'

/** 목록 정렬. RATING은 BE 리뷰 구현 전까지 최신순과 같다. */
export type LectureSort = 'LATEST' | 'PRICE_ASC' | 'PRICE_DESC' | 'RATING'

export type ContentType = 'VIDEO' | 'DOCUMENT'

/** 강의 파일 종류. 종류마다 받는 형식과 최대 크기가 다르다(rules.ts FILE_RULES) */
export type LectureFileType =
  'LECTURE_THUMBNAIL' | 'LECTURE_VIDEO' | 'LECTURE_DOCUMENT'

/** POST /lectures/files */
export type LectureFileInput = {
  fileType: LectureFileType
  originalFilename: string
  contentType: string
  /** 바이트. 본문 업로드의 Content-Length와 같아야 한다 */
  fileSize: number
}

/** 강의 콘텐츠 한 개(등록·교체 요청). fileId는 업로드 완료된 본인 파일이다 */
export type LectureContentInput = {
  fileId: number
  title: string
  contentType: ContentType
}

/**
 * PATCH /lectures/{lectureId}. 제목·소개·가격·썸네일 전체를 덮어쓴다.
 * thumbnailFileId가 null이면 썸네일을 지우므로, 유지하려면 상세의 thumbnailFileId를 그대로 보낸다(BE D53)
 */
export type LectureInfoUpdateInput = {
  title: string
  description: string | null
  priceHp: number
  thumbnailFileId: number | null
}

/** POST /lectures. contents 순서가 강 순서(sequence 1부터)다 */
export type LectureRegisterInput = LectureInfoUpdateInput & {
  contents: LectureContentInput[]
}

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
  /** 연결된 파일 ID. 판매자·관리자에게만 오고 그 밖에는 null(BE D53). 콘텐츠 교체에서 바꾸지 않는 강은 이 값을 다시 보낸다 */
  fileId: number | null
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
  /** 썸네일 파일 ID. 판매자·관리자에게만 오고 그 밖에는 null(BE D53). 정보 수정에서 썸네일을 유지하려면 다시 보낸다 */
  thumbnailFileId: number | null
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

/** GET /lectures/me 한 줄. 판매자 본인의 강의를 삭제한 것까지 모두 담는다 */
export type MyLecture = {
  lectureId: number
  title: string
  priceHp: number
  /** Presigned GET, 1시간 유효 */
  thumbnailUrl: string | null
  status: LectureStatus
  rejectionReason: string | null
  /** 삭제(soft delete)한 강의. status보다 우선해 삭제됨으로 보여 준다 */
  deleted: boolean
  inspectionRequestedAt: string
  inspectedAt: string | null
  createdAt: string
}

/** GET /lectures/sales 한 줄 (주문 항목 하나). 취소·반환한 것도 담는다 */
export type Sale = {
  orderItemId: number
  lectureId: number
  /** 주문 시점 제목 */
  lectureTitle: string
  /** 주문 시점 가격 */
  priceHp: number
  status: OrderItemStatus
  purchasedAt: string
  /** 구매일 + 31일 00:00 KST */
  payoutScheduledAt: string
  paidOutAt: string | null
  objectionStatus: ObjectionStatus
}
