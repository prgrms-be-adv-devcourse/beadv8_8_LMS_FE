import { useState } from 'react'
import { Modal } from '@/shared/ui/Modal'
import { closeLoginModal, useLoginModalStore } from '@/shared/ui/loginModal'
import { startGoogleLogin } from '@/shared/auth/session'
import { EmailLoginForm } from './EmailLoginForm'
import styles from './LoginModal.module.css'
import { PasswordResetForm } from './PasswordResetForm'
import { SignupForm } from './SignupForm'
import { TestAccountLogin } from './TestAccountLogin'

export function LoginModal() {
  const { open, reason } = useLoginModalStore()
  if (!open) return null
  return (
    <Modal title="합방 시작하기" onClose={closeLoginModal}>
      <LoginOptions reason={reason} />
    </Modal>
  )
}

type View = 'login' | 'signup' | 'reset'

/**
 * 구글 로그인과 이메일·비밀번호 로그인, 이메일 가입, 비밀번호 재설정. 이메일 하나는 두 방식 중 하나로만 가입·로그인한다.
 * 가입·재설정은 로그인까지 하지 않으므로 끝나면 로그인 화면으로 돌아와 이메일을 채워 둔다.
 * 모달을 닫으면 처음(로그인) 화면으로 돌아간다.
 */
function LoginOptions({ reason }: { reason?: string }) {
  const [view, setView] = useState<View>('login')
  // 가입·재설정을 마치고 돌아왔을 때 채울 이메일과 안내
  const [done, setDone] = useState<{ email: string; message: string } | null>(
    null,
  )
  // 비밀번호 재설정에 넘길, 로그인 폼에 적던 이메일
  const [resetEmail, setResetEmail] = useState('')
  // 화면을 바꿨는지. 바꾼 뒤에는 새 폼의 첫 칸으로 포커스한다(처음 열 때는 모달이 포커스를 정한다).
  const [switched, setSwitched] = useState(false)
  const show = (next: View) => {
    setSwitched(true)
    setView(next)
  }
  const finish = (email: string, message: string) => {
    setDone({ email, message })
    show('login')
  }

  if (view === 'signup')
    return (
      <SignupForm
        autoFocus={switched}
        onBack={() => show('login')}
        onDone={(email) =>
          finish(email, '가입했어요. 이메일과 비밀번호로 로그인해 주세요.')
        }
      />
    )
  if (view === 'reset')
    return (
      <PasswordResetForm
        initialEmail={resetEmail}
        onBack={() => show('login')}
        onDone={(email) =>
          finish(
            email,
            '비밀번호를 다시 설정했어요. 새 비밀번호로 로그인해 주세요.',
          )
        }
      />
    )
  return (
    <>
      {done ? (
        <p className="notice" role="status">
          {done.message}
        </p>
      ) : (
        reason && <p>{reason}</p>
      )}
      <button
        type="button"
        className="btn block google-btn"
        onClick={() => startGoogleLogin()}
      >
        <GoogleIcon />
        Google로 계속하기
      </button>
      <p className="fine">
        처음 로그인하면 유저로 가입돼요. 치지직 채널을 인증하면 인플루언서가
        돼요.
      </p>
      <p className={styles.divider}>또는 이메일로</p>
      <EmailLoginForm
        // 가입·재설정하고 돌아오면 그 이메일로 다시 그린다.
        key={done?.email ?? ''}
        initialEmail={done?.email ?? ''}
        autoFocus={switched}
        onSignup={() => show('signup')}
        onForgotPassword={(email) => {
          setResetEmail(email)
          show('reset')
        }}
      />
      {
        // 테스트 계정 로그인은 pnpm dev와 VITE_LOCAL_LOGIN=true로 직접 빌드한 이미지(로컬 k3d 확인용)에서만 보인다.
        // 조건을 여기에 그대로 써야 빌드가 값을 상수로 바꿔 운영 번들에서 TestAccountLogin(초기 계정 비밀번호)을 뺀다.
        (import.meta.env.DEV ||
          import.meta.env.VITE_LOCAL_LOGIN === 'true') && <TestAccountLogin />
      }
    </>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  )
}
