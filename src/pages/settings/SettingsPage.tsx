import { useQuery } from '@tanstack/react-query'
import { meQuery } from '@/shared/auth/me'
import { VIEWER_LABEL } from '@/shared/auth/role'
import { NicknameForm } from '@/features/account/NicknameForm'
import { ProfileImageEditor } from '@/features/account/ProfileImageEditor'
import { PageHead } from '@/shared/ui/PageHead'
import { Loading } from '@/shared/ui/QueryState'

// TODO: 알림 설정·회원 탈퇴는 BE API가 생기면 추가한다.
export function SettingsPage() {
  const { data: me } = useQuery(meQuery)

  return (
    <div className="page narrow">
      <PageHead title="계정 설정" />
      {!me ? (
        <Loading />
      ) : (
        <section className="panel form">
          <h2>계정</h2>
          <dl className="kv">
            {/* 구글·비밀번호 중 어느 방식으로 가입했는지는 BE가 알려 주지 않아 이메일만 보인다. */}
            <dt>이메일</dt>
            <dd>{me.email}</dd>
            <dt>회원 등급</dt>
            <dd>{VIEWER_LABEL[me.role]}</dd>
          </dl>
          <ProfileImageEditor me={me} />
          {/* 닉네임이 바뀌면 입력값을 새 값으로 다시 시작한다. */}
          <NicknameForm key={me.nickname} current={me.nickname} />
        </section>
      )}
    </div>
  )
}
