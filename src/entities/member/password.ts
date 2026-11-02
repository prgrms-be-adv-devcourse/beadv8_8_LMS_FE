/** 비밀번호 규칙 (BE Password와 같다): 8~64자, 영문·숫자·키보드 특수문자만, 영문과 숫자를 하나 이상씩 */
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 64

/** 규칙에 맞지 않으면 BE와 같은 안내 문구(같은 순서로 검사), 맞으면 null */
export function passwordError(password: string): string | null {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)
    return `비밀번호는 ${PASSWORD_MIN}~${PASSWORD_MAX}자로 입력해 주세요.`
  if (!/^[\x21-\x7E]+$/.test(password))
    return '비밀번호는 영문·숫자·특수문자만 쓸 수 있습니다. 공백과 한글은 쓸 수 없습니다.'
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    return '비밀번호에 영문과 숫자를 하나 이상씩 넣어 주세요.'
  return null
}

/** 이메일 형식. BE가 최종 확인하므로 눈에 띄는 실수만 막는다(앞뒤 공백은 BE가 지운다) */
export function emailError(input: string): string | null {
  const email = input.trim()
  if (!email) return '이메일을 입력해 주세요.'
  if (email.length > 255) return '이메일은 255자 이하로 입력해 주세요.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return '이메일 형식이 올바르지 않습니다.'
  return null
}
