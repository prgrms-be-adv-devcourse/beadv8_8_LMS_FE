/** 닉네임 규칙 (BE Nickname과 같다): 2~12자, 한글(완성형)·영문·숫자·공백·밑줄, 연속 공백 금지, 중복 허용 */
export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 12

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
