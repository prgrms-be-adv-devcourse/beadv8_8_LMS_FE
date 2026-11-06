import { useCallback, useRef, useState } from 'react'
import { cancelRestore } from '@/shared/auth/me'
import { Modal } from '@/shared/ui/Modal'
import {
  closeLoginModal,
  useLoginModalStore,
  type GoogleRestore,
} from '@/shared/ui/loginModal'
import { startGoogleLogin, usePasswordLogin } from '@/shared/auth/session'
import { EmailLoginForm, type RestorableLogin } from './EmailLoginForm'
import styles from './LoginModal.module.css'
import { PasswordResetForm } from './PasswordResetForm'
import { RestorePrompt } from './RestorePrompt'
import { SignupForm } from './SignupForm'
import { TestAccountLogin } from './TestAccountLogin'

export function LoginModal() {
  const { open, reason, restore } = useLoginModalStore()
  // 탈퇴 회원에게 복구할지 묻는 중인지(복구 티켓이 남아 있다)
  const askingRestore = useRef(false)
  const setAskingRestore = useCallback((asking: boolean) => {
    askingRestore.current = asking
  }, [])
  if (!open) return null
  const close = () => {
    // 고르지 않고 닫으면 복구하지 않은 것으로 보고 티켓을 지운다(공용 PC에 10분 동안 남지 않게).
    if (askingRestore.current) void cancelRestore().catch(() => undefined)
    closeLoginModal()
  }
  return (
    <Modal title="합방 시작하기" onClose={close}>
      {/* 열린 모달에서 복구 질문으로 바뀌어도 처음부터 다시 그린다. */}
      <LoginOptions
        key={restore ? 'restore' : 'login'}
        reason={reason}
        googleRestore={restore}
        onRestoreAskingChange={setAskingRestore}
      />
    </Modal>
  )
}

type View = 'login' | 'signup' | 'reset' | 'restore'

/** 복구할지 묻는 탈퇴 회원. 복구하면 로그인한 방식으로 다시 로그인한다 */
type Restore =
  ({ via: 'password' } & RestorableLogin) | ({ via: 'google' } & GoogleRestore)

/**
 * 구글 로그인과 이메일·비밀번호 로그인, 이메일 가입, 비밀번호 재설정. 이메일 하나는 두 방식 중 하나로만 가입·로그인한다.
 * 가입·재설정은 로그인까지 하지 않으므로 끝나면 로그인 화면으로 돌아와 이메일을 채워 둔다.
 * 복구할 수 있는 탈퇴 회원이 로그인하면 복구할지 묻고, 복구하면 같은 방식으로 다시 로그인한다.
 * 모달을 닫으면 처음(로그인) 화면으로 돌아간다.
 */
function LoginOptions({
  reason,
  googleRestore,
  onRestoreAskingChange,
}: {
  reason?: string
  googleRestore?: GoogleRestore
  onRestoreAskingChange: (asking: boolean) => void
}) {
  const [view, setView] = useState<View>(googleRestore ? 'restore' : 'login')
  // 가입·재설정·복구 질문에서 돌아왔을 때 채울 이메일과 안내(bad면 실패 안내)
  const [done, setDone] = useState<{
    email: string
    message?: string
    bad?: boolean
  } | null>(null)
  // 비밀번호 재설정에 넘길, 로그인 폼에 적던 이메일
  const [resetEmail, setResetEmail] = useState('')
  // 복구할지 묻는 탈퇴 회원의 로그인
  const [restore, setRestore] = useState<Restore | null>(
    googleRestore ? { via: 'google', ...googleRestore } : null,
  )
  const relogin = usePasswordLogin('계정을 복구하고 로그인했어요.')
  // 복구하고 구글 로그인 화면으로 가는 중
  const [leaving, setLeaving] = useState(false)
  // 화면을 바꿨는지. 바꾼 뒤에는 새 폼의 첫 칸으로 포커스한다(처음 열 때는 모달이 포커스를 정한다).
  const [switched, setSwitched] = useState(false)
  const show = (next: View) => {
    setSwitched(true)
    setView(next)
  }
  const finish = (email: string, message?: string, bad?: boolean) => {
    setDone({ email, message, bad })
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
  if (view === 'restore' && restore) {
    const email = restore.via === 'password' ? restore.email : ''
    return (
      <RestorePrompt
        restorableUntil={restore.restorableUntil}
        busy={relogin.isPending || leaving}
        onRestored={() => {
          if (restore.via === 'google') {
            setLeaving(true)
            startGoogleLogin(restore.returnTo ?? undefined)
            return
          }
          relogin.mutate(
            { email: restore.email, password: restore.password },
            { onError: (error) => finish(email, error.message, true) },
          )
        }}
        onCancelled={() => finish(email)}
        onFailed={(message) => finish(email, message, true)}
        onAskingChange={onRestoreAskingChange}
      />
    )
  }
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
      {done?.message ? (
        <p
          className={done.bad ? 'notice bad' : 'notice'}
          role={done.bad ? 'alert' : 'status'}
        >
          {done.message}
        </p>
      ) : (
        !done && reason && <p>{reason}</p>
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
        onRestorable={(login) => {
          setRestore({ via: 'password', ...login })
          show('restore')
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
