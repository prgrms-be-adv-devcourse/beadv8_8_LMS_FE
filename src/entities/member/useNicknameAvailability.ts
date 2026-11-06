import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { nicknameAvailabilityQuery } from './api'
import { nicknameError } from './nickname'

/**
 * 닉네임 칸을 벗어날 때(check) 그 값을 다른 회원이 쓰는지 미리 확인한다. 입력마다 부르지 않는다.
 * 값이 확인한 값과 달라지면 결과를 숨기고, 다시 칸을 벗어나면 새 값으로 확인한다.
 * 참고용이라 확인에 실패하면 아무것도 알리지 않는다(저장 때 BE가 409 DUPLICATE_NICKNAME으로 다시 막는다).
 */
export function useNicknameAvailability(
  input: string,
  {
    /** 확인하지 않는다(예: 지금 내 닉네임 그대로) */
    skip = false,
  } = {},
) {
  const nickname = input.trim()
  const [checked, setChecked] = useState<string | null>(null)
  // 확인한 값으로만 묻는다(입력하는 값마다 캐시 항목을 만들지 않는다).
  const { data } = useQuery({
    ...nicknameAvailabilityQuery(checked ?? ''),
    enabled: checked !== null,
  })
  return {
    /** 지금 값을 다른 회원이 쓴다 */
    taken: checked === nickname && data?.available === false,
    /** 칸을 벗어날 때 부른다. 규칙에 맞지 않는 값은 BE가 400을 주므로 묻지 않는다 */
    check: () => {
      if (!skip && nicknameError(nickname) === null) setChecked(nickname)
    },
  }
}
