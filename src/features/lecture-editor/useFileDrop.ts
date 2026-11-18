import { useState, type DragEvent } from 'react'

/**
 * 파일을 끌어다 놓는 자리. 놓은 첫 파일을 onFile로 넘기고(검사·업로드는 받는 쪽이 한다),
 * 끌고 있는 동안 dragging으로 강조한다. disabled면 놓아도 무시한다.
 */
export function useFileDrop(onFile: (file: File) => void, disabled = false) {
  const [dragging, setDragging] = useState(false)
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')

  return {
    dragging: dragging && !disabled,
    dropProps: {
      onDragOver: (e: DragEvent) => {
        if (disabled || !hasFiles(e)) return
        // 기본 동작(브라우저가 파일을 여는 것)을 막아야 drop이 온다.
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      },
      onDragLeave: (e: DragEvent) => {
        // 안쪽 요소로 옮겨 갈 때도 leave가 오므로 자리를 완전히 벗어날 때만 끈다.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setDragging(false)
      },
      onDrop: (e: DragEvent) => {
        setDragging(false)
        if (disabled || !hasFiles(e)) return
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
      },
    },
  }
}
