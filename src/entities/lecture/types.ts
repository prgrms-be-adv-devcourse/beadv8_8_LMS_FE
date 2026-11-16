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

/**
 * 강의 화면의 정렬 선택지. 검색어가 없으면 강의 목록 API, 있으면 강의 검색 API로 보내므로 두 API 값으로 바꿔 보낸다(sort.ts).
 * DEFAULT는 URL에 쓰지 않는다. 검색어가 있으면 관련도순, 없으면 최신순이다
 */
export type LectureBrowseSort = 'DEFAULT' | LectureSort

/** 강의 검색 API의 sort. 이 네 값 말고는 400 UNSUPPORTED_SORT다 */
export type LectureSearchSort =
  'latest,desc' | 'rating,desc' | 'price,asc' | 'price,desc'

/**
 * 검색어가 걸린 곳(GET /search/lectures). 값은 서버가 HTML escape하고 걸린 말만 <em>으로 감싼 HTML 문자열이다.
 * 걸리지 않은 칸은 null, contentTitles는 빈 배열이다
 */
export type LectureSearchHighlights = {
  /** 제목 전체 */
  title: string | null
  /** 판매자 닉네임 전체 */
  sellerNickname: string | null
  /** 소개에서 걸린 곳 주변 한 조각(약 100자). 줄바꿈이 섞일 수 있다 */
  description: string | null
  /** 걸린 콘텐츠(강) 제목들 */
  contentTitles: string[]
}

/** GET /search/lectures 한 줄. 판매 중이고 판매자가 정상인 강의만 온다. 썸네일은 없어 일괄 조회로 채운다 */
export type LectureSearchItem = {
  lectureId: number
  /** 원문(escape되지 않음) */
  title: string
  /** 아직 모르면 null(드묾) */
  priceHp: number | null
  sellerUserId: number
  /** 원문. 아직 모르면 null */
  sellerNickname: string | null
  /** 보정 전 원래 평균. 리뷰가 없으면 null */
  averageRating: number | null
  reviewCount: number
  /** 검색어가 있으면 늘 객체, 없으면 null */
  highlights: LectureSearchHighlights | null
}

/** GET /lectures/thumbnails. 요청한 강의 ID마다 키가 있고, 썸네일을 줄 수 없는 강의는 null이다 */
export type LectureThumbnails = Record<string, string | null>

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

/** GET /lectures/admin/inspections 한 줄. 삭제한 강의는 담지 않는다 */
export type InspectionLecture = {
  lectureId: number
  sellerUserId: number
  sellerNickname: string
  title: string
  priceHp: number
  status: LectureStatus
  /** 마지막 검수 신청 시각. 목록은 상태와 관계없이 이 값의 오래된 순이다 */
  inspectionRequestedAt: string
}

/** GET /lectures/sales 한 줄 (주문 항목 하나). 취소·반환한 것도 담는다 */
export type Sale = {
  orderItemId: number
  lectureId: number
  /** 주문 시점 제목 */
  lectureTitle: string
  /** 주문 시점 가격 */
  priceHp: number
  /** 쿠폰 할인 합(판매자 부담 + 플랫폼 부담). 쿠폰을 쓰지 않았으면 0 */
  discountHp: number
  /** 할인 중 판매자가 부담한 몫. 지급액에서 빠진다 */
  sellerDiscountHp: number
  /** 할인 중 플랫폼이 부담한 몫. 지급액에서 빠지지 않는다 */
  platformDiscountHp: number
  /** 판매자 지급액 = 가격 − 판매자 부담 할인 */
  sellerPayoutHp: number
  status: OrderItemStatus
  purchasedAt: string
  /** 구매일 + 31일 00:00 KST */
  payoutScheduledAt: string
  paidOutAt: string | null
  objectionStatus: ObjectionStatus
}
