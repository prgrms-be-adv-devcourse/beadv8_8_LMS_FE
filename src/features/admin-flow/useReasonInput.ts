import { useState } from 'react'
import { useFieldErrors } from '@/shared/lib/useFieldErrors'

/**
 * 관리자의 반려·거절·최종 실패 사유 칸의 값과 검사. 필수이고 앞뒤 공백을 뺀 길이로 센다.
 * 오류를 보이는 때는 다른 폼과 같다(useFieldErrors): 비운 채 떠나거나 보내려 하면 안내하고 칸으로 포커스한다.
 * 막힌 보내기 버튼은 끄지 않고 submitProps(aria-disabled)로 막힌 모양만 둔다.
 */
export function useReasonInput({
  id,
  max,
  emptyMessage,
}: {
  id: string
  max: number
  /** 비었을 때 안내. 예: '거절 사유를 입력해 주세요.' */
  emptyMessage: string
}) {
  const [value, setValue] = useState('')
  const trimmed = value.trim()
  const fields = useFieldErrors({
    ids: { reason: id },
    order: ['reason'],
    errors: {
      reason:
        trimmed.length === 0
          ? emptyMessage
          : trimmed.length > max
            ? `${max}자까지 입력할 수 있어요.`
            : undefined,
    },
  })

  return {
    trimmed,
    /** 보낼 수 있으면 true. 아니면 오류를 보이고 칸으로 포커스한다 */
    check: () => !fields.blockSubmit(),
    /** 보내기 버튼에 펼친다 */
    submitProps: fields.submitProps,
    /** 서버가 사유 형식을 거절했을 때(코드로 안다) 칸 아래에 보이고 포커스한다 */
    showServerError: (message: string) =>
      fields.showServerErrors([{ field: 'reason', message }]),
    /** 서버 400 필드 오류(errors[]의 reason)를 칸 아래에 보인다. 있으면 true */
    applyServerErrors: fields.applyServerErrors,
    field: {
      id,
      max,
      value,
      error: fields.error('reason'),
      inputProps: fields.inputProps('reason'),
      onChange: (next: string) => {
        fields.changed('reason')
        setValue(next)
      },
    },
  }
}
