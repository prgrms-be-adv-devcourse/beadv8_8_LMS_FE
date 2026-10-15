import { useRef } from 'react'
import { UploadProgress } from './LessonList'
import { THUMB_KEY, type Uploads } from './useUploads'

/** 썸네일 이미지(선택). 고르는 즉시 올린다. 없으면 미리보기는 기본 색 카드다. */
export function ThumbnailPicker({ uploads }: { uploads: Uploads }) {
  const input = useRef<HTMLInputElement>(null)
  const { upload, rejection } = uploads.get(THUMB_KEY)
  const error = rejection ?? (upload?.status === 'error' ? upload.error : null)

  return (
    <div className="field">
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
        썸네일
      </span>
      <div className="thumb-pick">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          aria-label="썸네일 파일"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) uploads.start(THUMB_KEY, 'THUMBNAIL', file)
          }}
        />
        <button
          type="button"
          className="upload-mini"
          disabled={upload?.status === 'uploading'}
          onClick={() => input.current?.click()}
        >
          {upload ? '이미지 바꾸기' : '이미지 올리기'}
        </button>
        {upload?.status === 'error' && (
          <button
            type="button"
            className="btn sm"
            onClick={() => uploads.retry(THUMB_KEY)}
          >
            다시 올리기
          </button>
        )}
        {upload && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => uploads.remove(THUMB_KEY)}
          >
            빼기
          </button>
        )}
        {upload?.status === 'uploading' && (
          <UploadProgress label="썸네일 업로드" ratio={upload.progress} />
        )}
      </div>
      {error ? (
        <span className="fine c-bad" role="alert">
          {error}
        </span>
      ) : (
        <span className="fine">jpg·png·webp, 5MB 이하</span>
      )}
    </div>
  )
}
