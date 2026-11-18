import { useRef } from 'react'
import styles from './LectureEditor.module.css'
import { UploadProgress } from './LessonList'
import { useFileDrop } from './useFileDrop'
import { THUMB_KEY, type Uploads } from './useUploads'

type ThumbnailPickerProps = {
  uploads: Uploads
  /** 강의에 이미 있는 썸네일(수정). 새 파일을 올리거나 빼지 않으면 그대로 둔다 */
  hasCurrent?: boolean
  /** 기존 썸네일을 뺀다. 저장하면 썸네일이 지워진다 */
  onRemoveCurrent?: () => void
  /** 지금 쓰일 썸네일 주소(올린 파일 또는 기존 썸네일). 없으면 빈 16:9 자리를 보인다 */
  previewUrl?: string | null
}

/** 썸네일 이미지(선택). 고르거나 끌어다 놓는 즉시 올린다. 없으면 미리보기는 기본 색 카드다. */
export function ThumbnailPicker({
  uploads,
  hasCurrent = false,
  onRemoveCurrent,
  previewUrl,
}: ThumbnailPickerProps) {
  const input = useRef<HTMLInputElement>(null)
  const { upload, rejection } = uploads.get(THUMB_KEY)
  const error = rejection ?? (upload?.status === 'error' ? upload.error : null)
  const has = !!upload || hasCurrent
  const busy = upload?.status === 'uploading'
  const { dragging, dropProps } = useFileDrop(
    (file) => uploads.start(THUMB_KEY, 'THUMBNAIL', file),
    busy,
  )

  return (
    <div className="field">
      <div
        {...dropProps}
        className={dragging ? `${styles.drop} ${styles.dragging}` : styles.drop}
      >
        <div className={styles.preview}>
          {previewUrl ? (
            <img src={previewUrl} alt="" />
          ) : (
            <span className={styles.ratio} aria-hidden="true">
              16 : 9
            </span>
          )}
        </div>
        <div className={styles.dropBody}>
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
          <div className={styles.dropActions}>
            <button
              type="button"
              className={`upload-mini ${styles.pickButton}`}
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {has ? '이미지 바꾸기' : '이미지 올리기'}
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
            {has && (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  uploads.remove(THUMB_KEY)
                  onRemoveCurrent?.()
                }}
              >
                빼기
              </button>
            )}
          </div>
          {busy && (
            <UploadProgress label="썸네일 업로드" ratio={upload.progress} />
          )}
          {error ? (
            <span className="fine c-bad" role="alert">
              {error}
            </span>
          ) : (
            <span className="fine">
              jpg·png·webp, 5MB 이하 · 여기로 끌어다 놓아도 돼요
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
