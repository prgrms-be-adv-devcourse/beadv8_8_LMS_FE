import { Link } from 'react-router'
import { WithdrawForm } from '@/features/account/WithdrawForm'
import { PageHead } from '@/shared/ui/PageHead'

/** 파기·보존 항목: BE docs/policy.md 삭제 정책 (#594) */
const DESTROYED = [
  '이메일·닉네임·프로필 사진',
  '구글 계정 연결·비밀번호 정보',
  '치지직 채널 이름·주소',
  '환전 계좌번호·예금주',
]
const KEPT = [
  '충전·환불·지급·환전 금액과 일시',
  '채팅 메시지·문의 본문 (분쟁 확인용)',
  "채팅·문의 작성자는 '탈퇴한 회원'으로 표시",
]

/**
 * 회원 탈퇴(관리자 제외). BE에 미리 확인하는 API가 없어 남은 HP·진행 중 거래는 탈퇴하기를 누른 뒤 한꺼번에 알려 준다.
 */
export function WithdrawPage() {
  return (
    <div className="page narrow">
      <Link className="back" to="/settings">
        ← 계정 설정
      </Link>
      <PageHead title="회원 탈퇴" lede="탈퇴 전에 아래 내용을 확인해 주세요." />
      <section className="panel" aria-labelledby="withdraw-after-title">
        <h2 id="withdraw-after-title">탈퇴하면</h2>
        <p className="fine">
          30일 안에 다시 로그인하면 계정을 복구할 수 있어요. 30일이 지나면 아래
          개인정보를 파기해 복구할 수 없어요.
        </p>
        <div className="claims">
          <div>
            <b>30일 뒤 파기돼요</b>
            <ul className="plain">
              {DESTROYED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <b>기록으로 남아요</b>
            <ul className="plain">
              {KEPT.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section className="panel" aria-labelledby="withdraw-check-title">
        <h2 id="withdraw-check-title">탈퇴 전에 정리할 것</h2>
        <p className="fine">
          남은 HP(충전·수익)나 끝나지 않은 거래(출연, 강의 주문·판매,
          환불·환전)가 있으면 탈퇴할 수 없어요. 탈퇴하기를 누르면 정리할 항목을
          알려 드려요.
        </p>
      </section>
      <WithdrawForm />
    </div>
  )
}
