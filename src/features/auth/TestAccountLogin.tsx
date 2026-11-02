import { useId } from 'react'
import { VIEWER_LABEL, type Role } from '@/shared/auth/role'
import { useTestAccountLogin } from '@/shared/auth/session'
import styles from './LoginModal.module.css'

/**
 * BE 초기 계정(MemberSeedAccountUseCase): 역할마다 하나. 유저는 초기 계정이 없다(가입하면 된다).
 * 이 모듈은 LoginModal이 빌드 시점 조건(개발 서버·VITE_LOCAL_LOGIN 빌드)으로만 그려서, 운영 빌드에서는 번들에서 빠진다.
 * 계정·비밀번호를 다른 모듈로 옮기면 운영 번들에 남을 수 있다.
 */
const TEST_ACCOUNTS: { role: Role; email: string }[] = [
  { role: 'INFLUENCER', email: 'influencer@hapbang.local' },
  { role: 'VERIFIED_INFLUENCER', email: 'verified-influencer@hapbang.local' },
  { role: 'ADMIN', email: 'admin@hapbang.local' },
]
const TEST_ACCOUNT_PASSWORD = 'hapbang1234!'

/** 개발용: Google 없이 역할별 BE 초기 계정으로 로그인한다(이메일·비밀번호 로그인). */
export function TestAccountLogin() {
  const labelId = useId()
  const { mutate, isPending } = useTestAccountLogin()
  return (
    <div className={styles.testAccounts} role="group" aria-labelledby={labelId}>
      <p id={labelId} className="fine">
        개발용 테스트 계정
      </p>
      <div className={styles.accounts}>
        {TEST_ACCOUNTS.map((account) => (
          <button
            key={account.role}
            type="button"
            className="btn sm"
            disabled={isPending}
            onClick={() =>
              mutate({ ...account, password: TEST_ACCOUNT_PASSWORD })
            }
          >
            {VIEWER_LABEL[account.role]}
          </button>
        ))}
      </div>
    </div>
  )
}
