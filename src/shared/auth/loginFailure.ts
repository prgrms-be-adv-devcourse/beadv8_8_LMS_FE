/**
 * 구글 로그인 실패 때 BE가 보내는 오류 코드(/login?error=)의 안내 문구. BE 회원 오류 메시지와 맞춘다.
 * BE가 회원 처리에서 막은 경우는 회원 오류 코드, 구글 단계에서 끝난 경우는 OAuth 오류 코드(access_denied 등)다.
 */
const MESSAGES: Record<string, string> = {
  // 이메일 하나는 구글이나 비밀번호 중 한 방식으로만 가입한다. 로그인 모달의 이메일 로그인으로 이어진다.
  EMAIL_REGISTERED_WITH_PASSWORD:
    '이미 비밀번호로 가입된 이메일입니다. 이메일과 비밀번호로 로그인해 주세요.',
  DUPLICATE_EMAIL: '이미 가입된 이메일입니다.',
  LOGIN_NOT_ALLOWED: '탈퇴했거나 이용할 수 없는 회원입니다.',
  // 사용자가 구글 동의 화면에서 취소했다.
  access_denied: '구글 로그인을 취소했어요.',
}

const FALLBACK = '구글 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.'

export function loginFailureMessage(code: string | null): string {
  return code && Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : FALLBACK
}
