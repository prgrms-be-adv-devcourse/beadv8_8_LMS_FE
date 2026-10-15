import { useEffect, useMemo } from 'react'

/** 미리보기용 로컬 주소. 파일이 바뀌거나 화면을 떠나면 해제한다 */
export function useObjectUrl(file: File | undefined): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => {
    if (!url) return
    return () => URL.revokeObjectURL(url)
  }, [url])
  return url
}
