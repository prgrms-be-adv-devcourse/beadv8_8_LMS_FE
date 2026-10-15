import { useRef } from 'react'
import { TITLE_MAX } from '@/entities/lecture/rules'
import type { ContentType, LectureContent } from '@/entities/lecture/types'
import type { Upload, Uploads } from './useUploads'

/** 이미 강의에 연결돼 있는 파일. 새 파일을 올리지 않으면 이 fileId를 그대로 다시 보낸다 */
export type CurrentFile = { fileId: number; contentType: ContentType }

export type Lesson = { key: string; title: string; current?: CurrentFile }

type LessonListProps = {
  lessons: Lesson[]
  uploads: Uploads
  /** 검수 신청 때 BE가 돌려준 강 제목 오류 (강 key별) */
  titleErrors: Record<string, string | undefined>
  /** 판매 중·검수 대기 강의. 제목과 파일을 바꿀 수 없고 미리보기만 된다 */
  readOnly?: boolean
  /** 강에 연결된 저장된 콘텐츠. 있으면 미리보기 버튼을 둔다(새로 올린 파일은 저장 전이라 없음) */
  savedContentOf?: (lesson: Lesson) => LectureContent | undefined
  onPreview?: (content: LectureContent) => void
  onTitle: (key: string, title: string) => void
  onMove: (index: number, by: -1 | 1) => void
  onRemove: (key: string) => void
}

/** 강 목록. 강마다 제목과 파일(영상 mp4 또는 자료 pdf)을 넣는다. */
export function LessonList({
  lessons,
  uploads,
  titleErrors,
  readOnly = false,
  savedContentOf,
  onPreview,
  onTitle,
  onMove,
  onRemove,
}: LessonListProps) {
  return (
    <div className="lessons">
      {lessons.map((lesson, i) => (
        <LessonRow
          key={lesson.key}
          no={i + 1}
          lesson={lesson}
          uploads={uploads}
          titleError={titleErrors[lesson.key]}
          readOnly={readOnly}
          first={i === 0}
          last={i === lessons.length - 1}
          saved={savedContentOf?.(lesson)}
          onPreview={onPreview}
          onTitle={(title) => onTitle(lesson.key, title)}
          onMove={(by) => onMove(i, by)}
          onRemove={lessons.length > 1 ? () => onRemove(lesson.key) : undefined}
        />
      ))}
    </div>
  )
}

type LessonRowProps = {
  no: number
  lesson: Lesson
  uploads: Uploads
  titleError?: string
  readOnly: boolean
  first: boolean
  last: boolean
  saved?: LectureContent
  onPreview?: (content: LectureContent) => void
  onTitle: (title: string) => void
  onMove: (by: -1 | 1) => void
  /** 없으면 마지막 1강이라 지울 수 없다 */
  onRemove?: () => void
}

function LessonRow({
  no,
  lesson,
  uploads,
  titleError,
  readOnly,
  first,
  last,
  saved,
  onPreview,
  onTitle,
  onMove,
  onRemove,
}: LessonRowProps) {
  const input = useRef<HTMLInputElement>(null)
  const { upload, rejection } = uploads.get(lesson.key)
  const busy = upload?.status === 'uploading'
  const error = rejection ?? (upload?.status === 'error' ? upload.error : null)
  const preview = saved && onPreview && (
    <button
      type="button"
      className="btn ghost sm"
      onClick={() => onPreview(saved)}
    >
      미리보기
    </button>
  )

  if (readOnly) {
    return (
      <div className="lesson" role="group" aria-label={`${no}강`}>
        <span className="no num">{String(no).padStart(2, '0')}</span>
        <div className="lesson-main">
          <span className="row-title">{lesson.title}</span>
          <div className="lesson-meta">
            <UploadMeta no={no} upload={upload} current={lesson.current} />
          </div>
        </div>
        {preview && <div className="row-actions">{preview}</div>}
      </div>
    )
  }

  return (
    <div className="lesson" role="group" aria-label={`${no}강`}>
      <span className="no num">{String(no).padStart(2, '0')}</span>
      <div className="lesson-main">
        <input
          className="input"
          aria-label={`${no}강 제목`}
          placeholder="강의 제목"
          maxLength={TITLE_MAX}
          value={lesson.title}
          onChange={(e) => onTitle(e.target.value)}
        />
        {titleError && (
          <span className="fine c-bad" role="alert">
            {titleError}
          </span>
        )}
        <div className="lesson-meta">
          <UploadMeta no={no} upload={upload} current={lesson.current} />
        </div>
        {error && (
          <span className="fine c-bad" role="alert">
            {error}
          </span>
        )}
      </div>
      <div className="row-actions">
        <input
          ref={input}
          type="file"
          accept="video/mp4,application/pdf,.mp4,.pdf"
          hidden
          aria-label={`${no}강 파일`}
          onChange={(e) => {
            const file = e.target.files?.[0]
            // 같은 파일을 다시 골라도 change가 일어나게 비운다.
            e.target.value = ''
            if (file) uploads.start(lesson.key, 'LESSON', file)
          }}
        />
        {preview}
        {upload?.status === 'error' && (
          <button
            type="button"
            className="btn sm"
            onClick={() => uploads.retry(lesson.key)}
          >
            다시 올리기
          </button>
        )}
        <button
          type="button"
          className="btn sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {upload || lesson.current ? '파일 교체' : '파일 올리기'}
        </button>
        <button
          type="button"
          className="btn ghost sm"
          aria-label="위로"
          disabled={first}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn ghost sm"
          aria-label="아래로"
          disabled={last}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={!onRemove}
          onClick={onRemove}
        >
          삭제
        </button>
      </div>
    </div>
  )
}

const KIND: Record<ContentType, string> = { VIDEO: '영상', DOCUMENT: '자료' }

/** 강의 파일 상태. 새로 올린 파일이 없으면 이미 연결된 파일을 보여 준다(BE가 파일명을 주지 않아 종류만) */
export function UploadMeta({
  no,
  upload,
  current,
}: {
  no: number
  upload?: Upload
  current?: CurrentFile
}) {
  if (!upload || upload.status === 'error') {
    if (current)
      return (
        <span className="fine">{KIND[current.contentType]} · 올린 파일</span>
      )
    return <span className="fine c-bad">파일이 없어요</span>
  }
  if (upload.status === 'uploading') {
    return <UploadProgress label={`${no}강 업로드`} ratio={upload.progress} />
  }
  const kind = upload.fileType === 'LECTURE_DOCUMENT' ? '자료' : '영상'
  return (
    <span className="fine">
      {kind} · {upload.file.name} ({formatBytes(upload.file.size)})
    </span>
  )
}

export function UploadProgress({
  label,
  ratio,
}: {
  label: string
  ratio: number
}) {
  const percent = Math.round(ratio * 100)
  return (
    <>
      <span className="fine">올리는 중… {percent}%</span>
      <span
        className="progress"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        style={{ width: 80 }}
      >
        <span style={{ width: `${percent}%` }} />
      </span>
    </>
  )
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`
  if (mb >= 1) return `${Math.round(mb)}MB`
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}
