import { isApiError } from '@/shared/api/ApiError'
import type { ContentType, LectureFileType } from './types'

/** 강의 가격 단위. 1,000 HP 이상, 1,000 HP 단위이고 무료 강의는 없다(BE INVALID_PRICE). */
export const PRICE_UNIT = 1000
/** 제목 최대 길이 (BE VARCHAR 255) */
export const TITLE_MAX = 255

export function priceError(price: number): string | null {
  if (price < PRICE_UNIT) return '1,000 HP 이상으로 정해 주세요.'
  if (price % PRICE_UNIT)
    return '1,000 HP 단위로 정해 주세요. 무료 강의는 없어요.'
  return null
}

/** 파일을 넣는 자리. 강에는 영상(mp4)이나 자료(pdf), 썸네일에는 이미지를 넣는다 */
export type FileSlot = 'LESSON' | 'THUMBNAIL'

const MB = 1024 * 1024

// 받는 형식과 최대 크기 (BE lecture FileType)
const FILE_RULES: Record<
  LectureFileType,
  { contentTypes: string[]; maxBytes: number; tooLarge: string }
> = {
  LECTURE_THUMBNAIL: {
    contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 5 * MB,
    tooLarge: '썸네일은 5MB까지 올릴 수 있어요.',
  },
  LECTURE_VIDEO: {
    contentTypes: ['video/mp4'],
    maxBytes: 2048 * MB,
    tooLarge: '영상은 2GB까지 올릴 수 있어요.',
  },
  LECTURE_DOCUMENT: {
    contentTypes: ['application/pdf'],
    maxBytes: 50 * MB,
    tooLarge: '자료는 50MB까지 올릴 수 있어요.',
  },
}

const SLOT_FILE_TYPES: Record<FileSlot, LectureFileType[]> = {
  LESSON: ['LECTURE_VIDEO', 'LECTURE_DOCUMENT'],
  THUMBNAIL: ['LECTURE_THUMBNAIL'],
}

const WRONG_TYPE: Record<FileSlot, string> = {
  LESSON: 'mp4 영상이나 pdf 자료만 올릴 수 있어요.',
  THUMBNAIL: 'jpg·png·webp 이미지만 올릴 수 있어요.',
}

// 운영체제가 형식을 알려 주지 않으면(file.type이 빈 값) 확장자로 정한다.
const EXTENSION_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

function resolveContentType(file: File): string {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_TYPES[ext] ?? ''
}

export type CheckedFile = { fileType: LectureFileType; contentType: string }

/** 올리기 전에 형식과 크기를 검사한다. 맞지 않으면 화면에 보일 문구를 돌려준다. */
export function checkFile(
  slot: FileSlot,
  file: File,
): CheckedFile | { error: string } {
  const contentType = resolveContentType(file)
  const fileType = SLOT_FILE_TYPES[slot].find((type) =>
    FILE_RULES[type].contentTypes.includes(contentType),
  )
  if (!fileType) return { error: WRONG_TYPE[slot] }
  if (file.size > FILE_RULES[fileType].maxBytes)
    return { error: FILE_RULES[fileType].tooLarge }
  return { fileType, contentType }
}

export function contentTypeOf(fileType: LectureFileType): ContentType {
  return fileType === 'LECTURE_DOCUMENT' ? 'DOCUMENT' : 'VIDEO'
}

/** 업로드 실패(BE 오류 코드, 네트워크 끊김)를 화면 문구로 바꾼다. */
export function uploadErrorMessage(
  error: unknown,
  slot: FileSlot,
  fileType: LectureFileType,
): string {
  if (!isApiError(error)) return '업로드가 끊겼어요. 다시 올려 주세요.'
  switch (error.code) {
    case 'UNSUPPORTED_FILE_CONTENT_TYPE':
      return WRONG_TYPE[slot]
    case 'FILE_TOO_LARGE':
      return FILE_RULES[fileType].tooLarge
    case 'FILE_SIZE_MISMATCH':
    case 'FILE_CONTENT_TYPE_MISMATCH':
      return '파일이 올리는 중에 바뀌었어요. 다시 올려 주세요.'
    case 'FILE_ALREADY_UPLOADED':
      return '이미 올린 파일이에요. 다시 올려 주세요.'
    case 'NETWORK_ERROR':
      return '업로드가 끊겼어요. 다시 올려 주세요.'
    default:
      return error.message
  }
}
