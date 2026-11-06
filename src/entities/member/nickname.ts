/**
 * 닉네임 규칙 (BE Nickname과 같다): 2~12자, 한글(완성형)·영문·숫자·공백·밑줄, 연속 공백 금지.
 * 다른 회원(탈퇴 회원 포함)과 겹칠 수 없고 대소문자는 구분하지 않는다(Abc = abc). 겹치는지는 BE가 본다(BE #646).
 */
export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 12

/** 다른 회원이 쓰는 닉네임 (BE DUPLICATE_NICKNAME 문구와 같다) */
export const NICKNAME_TAKEN = '이미 쓰고 있는 닉네임이에요.'

/** 닉네임 칸이 원인인 BE 오류 코드: 규칙 위반(400)과 중복(409) */
export const NICKNAME_ERROR_CODES: ReadonlySet<string> = new Set([
  'INVALID_NICKNAME_LENGTH',
  'INVALID_NICKNAME_CHARACTER',
  'INVALID_NICKNAME_SPACE',
  'DUPLICATE_NICKNAME',
])

/** 규칙에 맞지 않으면 안내 문구, 맞으면 null. 앞뒤 공백은 BE가 지운다. */
export function nicknameError(input: string): string | null {
  const nickname = input.trim()
  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX)
    return `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 입력해 주세요.`
  if (!/^[가-힣A-Za-z0-9_ ]+$/.test(nickname))
    return '닉네임은 한글·영문·숫자·공백·밑줄만 쓸 수 있어요.'
  if (/ {2,}/.test(nickname)) return '닉네임에 공백을 연속으로 쓸 수 없어요.'
  return null
}
