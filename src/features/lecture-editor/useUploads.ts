import { useCallback, useEffect, useRef, useState } from 'react'
import {
  registerLectureFile,
  uploadLectureFileContent,
} from '@/entities/lecture/api'
import {
  checkFile,
  uploadErrorMessage,
  type CheckedFile,
  type FileSlot,
} from '@/entities/lecture/rules'
import { isAbortError } from '@/shared/api/upload'

/** 썸네일 자리의 key. 강은 강마다 만든 key를 쓴다 */
export const THUMB_KEY = 'thumb'

type UploadBase = CheckedFile & { slot: FileSlot; file: File }

export type Upload =
  | (UploadBase & { status: 'uploading'; progress: number })
  | (UploadBase & { status: 'done'; fileId: number })
  | (UploadBase & { status: 'error'; error: string })

export type UploadEntry = {
  upload?: Upload
  /** 올리기 전에 거절한 파일의 문구. 이전에 올린 파일은 그대로 둔다 */
  rejection?: string
}

/**
 * 자리(강·썸네일)별 파일 업로드. 형식·크기 검사 → 파일 정보 등록 → 본문 업로드를 한 번에 한다.
 * 자리마다 따로(동시에) 올리고, 같은 자리에 다시 올리거나 지우면 진행 중인 업로드를 취소한다.
 * 화면을 떠나면(언마운트) 모든 업로드를 취소한다.
 */
export function useUploads() {
  const [entries, setEntries] = useState<Record<string, UploadEntry>>({})
  const controllers = useRef(new Map<string, AbortController>())

  useEffect(() => {
    const map = controllers.current
    return () => map.forEach((controller) => controller.abort())
  }, [])

  const setEntry = useCallback((key: string, entry: UploadEntry) => {
    setEntries((prev) => ({ ...prev, [key]: entry }))
  }, [])

  const start = useCallback(
    async (key: string, slot: FileSlot, file: File) => {
      const checked = checkFile(slot, file)
      if ('error' in checked) {
        setEntries((prev) => ({
          ...prev,
          [key]: { ...prev[key], rejection: checked.error },
        }))
        return
      }

      controllers.current.get(key)?.abort()
      const controller = new AbortController()
      controllers.current.set(key, controller)
      const isCurrent = () => controllers.current.get(key) === controller
      const base: UploadBase = { ...checked, slot, file }
      setEntry(key, { upload: { ...base, status: 'uploading', progress: 0 } })

      try {
        const { fileId } = await registerLectureFile(
          {
            fileType: checked.fileType,
            originalFilename: file.name,
            contentType: checked.contentType,
            fileSize: file.size,
          },
          controller.signal,
        )
        await uploadLectureFileContent(fileId, file, {
          contentType: checked.contentType,
          signal: controller.signal,
          onProgress: (progress) => {
            if (isCurrent())
              setEntry(key, {
                upload: { ...base, status: 'uploading', progress },
              })
          },
        })
        if (!isCurrent()) return
        controllers.current.delete(key)
        setEntry(key, { upload: { ...base, status: 'done', fileId } })
      } catch (error) {
        if (!isCurrent() || isAbortError(error)) return
        controllers.current.delete(key)
        setEntry(key, {
          upload: {
            ...base,
            status: 'error',
            error: uploadErrorMessage(error, slot, checked.fileType),
          },
        })
      }
    },
    [setEntry],
  )

  /** 실패한 파일을 파일 정보 등록부터 다시 올린다 */
  const retry = useCallback(
    (key: string) => {
      const upload = entries[key]?.upload
      if (upload?.status === 'error') void start(key, upload.slot, upload.file)
    },
    [entries, start],
  )

  /** 자리를 비운다. 올리는 중이면 취소한다 */
  const remove = useCallback((key: string) => {
    controllers.current.get(key)?.abort()
    controllers.current.delete(key)
    setEntries((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const uploading = Object.values(entries).some(
    (entry) => entry.upload?.status === 'uploading',
  )

  return {
    get: (key: string): UploadEntry => entries[key] ?? {},
    start: (key: string, slot: FileSlot, file: File) =>
      void start(key, slot, file),
    retry,
    remove,
    uploading,
  }
}

export type Uploads = ReturnType<typeof useUploads>
