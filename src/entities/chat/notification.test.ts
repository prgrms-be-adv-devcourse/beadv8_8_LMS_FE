import { describe, expect, it } from 'vitest'
import { notificationLine, notificationText } from './notification'

const request = {
  v: 1,
  hostNickname: '호스트',
  title: '금요일 밤 합방',
  fee: 50000,
  scheduledAt: '2026-11-20T21:00:00',
  acceptDeadline: '2026-11-13T23:59:00',
}

describe('notificationText', () => {
  it('출연 요청 도착은 값으로 문구를 만든다(천 단위 구분, 일시는 KST 그대로)', () => {
    expect(
      notificationText({
        messageType: 'NOTIFICATION',
        content: '',
        notificationKind: 'APPEARANCE_REQUEST_SENT',
        appearanceRequestSent: request,
      }),
    ).toEqual({
      title: '호스트님이 출연을 요청했습니다.',
      lines: [
        '제목: 금요일 밤 합방',
        '출연료: 50,000 HP',
        '방송 예정: 11/20(금) 21:00',
        '수락 기한: 11/13(금) 23:59',
      ],
    })
  })

  it('출연 모집 지원 도착은 값으로 문구를 만들고, 모르는 키는 무시한다', () => {
    expect(
      notificationText({
        messageType: 'NOTIFICATION',
        content: '',
        notificationKind: 'APPEARANCE_APPLICATION_SUBMITTED',
        appearanceApplicationSubmitted: {
          v: 1,
          guestNickname: '게스트',
          recruitTitle: '주말 게임 합방 모집',
          later: '나중에 더한 키',
        },
      }),
    ).toEqual({
      title: '게스트님이 출연 모집에 지원했습니다.',
      lines: ['모집글: 주말 게임 합방 모집'],
    })
  })

  it('값이 없으면(이전 알림) 서버 문구를 첫 줄 제목으로 나눠 쓴다', () => {
    expect(
      notificationText({
        messageType: 'NOTIFICATION',
        content: '고래님이 출연 모집에 지원했습니다.\n모집글: 옛 모집',
        notificationKind: 'APPEARANCE_APPLICATION_SUBMITTED',
        appearanceApplicationSubmitted: null,
      }),
    ).toEqual({
      title: '고래님이 출연 모집에 지원했습니다.',
      lines: ['모집글: 옛 모집'],
    })
  })

  it.each([
    ['모르는 버전', { ...request, v: 2 }],
    ['키 누락', { ...request, title: undefined }],
    ['형식이 다름', { ...request, fee: '50000' }],
    ['일시가 비었음', { ...request, scheduledAt: '' }],
    ['일시 형식이 다름', { ...request, acceptDeadline: 'bad-date' }],
    ['없는 날짜', { ...request, scheduledAt: '2026-13-40T25:00:00' }],
  ])(
    '%s이면 서버 문구가 없을 때 종류만으로 만든 문구를 쓴다',
    (_, appearanceRequestSent) => {
      expect(
        notificationText({
          messageType: 'NOTIFICATION',
          content: '',
          notificationKind: 'APPEARANCE_REQUEST_SENT',
          appearanceRequestSent,
        }),
      ).toEqual({ title: '출연 요청이 도착했습니다.', lines: [] })
    },
  )

  it('템플릿을 못 만들어도 서버 문구가 있으면 그것을 쓴다', () => {
    expect(
      notificationText({
        messageType: 'NOTIFICATION',
        content: '서버 문구\n둘째 줄',
        notificationKind: 'APPEARANCE_REQUEST_SENT',
        appearanceRequestSent: { v: 2 },
      }),
    ).toEqual({ title: '서버 문구', lines: ['둘째 줄'] })
  })

  it.each(['SOMETHING_NEW', 'constructor', 'toString'])(
    '모르는 종류(%s)는 일반 문구를 쓴다',
    (kind) => {
      expect(
        notificationText({
          messageType: 'NOTIFICATION',
          content: '',
          // 서버가 나중에 더할 종류
          notificationKind: kind as 'APPEARANCE_REQUEST_SENT',
          appearanceRequestSent: request,
        }),
      ).toEqual({ title: '새 알림이 도착했습니다.', lines: [] })
    },
  )

  it('값은 알림 종류에 맞는 필드에서만 읽는다(다른 종류 필드·객체가 아닌 값은 쓰지 않는다)', () => {
    expect(
      notificationText({
        messageType: 'NOTIFICATION',
        content: '',
        notificationKind: 'APPEARANCE_REQUEST_SENT',
        appearanceApplicationSubmitted: {
          v: 1,
          guestNickname: '게스트',
          recruitTitle: '모집',
        },
      }),
    ).toEqual({ title: '출연 요청이 도착했습니다.', lines: [] })
    expect(
      notificationText({
        messageType: 'NOTIFICATION',
        content: '',
        notificationKind: 'APPEARANCE_REQUEST_SENT',
        appearanceRequestSent: [request] as unknown as Record<string, unknown>,
      }),
    ).toEqual({ title: '출연 요청이 도착했습니다.', lines: [] })
  })
})

describe('시스템 안내(값 형식은 후속에서 정한다)', () => {
  it('값이 없으면 서버 문구를 쓴다', () => {
    expect(
      notificationLine({
        messageType: 'SYSTEM',
        content: '고래님이 나갔습니다.',
      }),
    ).toBe('고래님이 나갔습니다.')
  })

  it('아직 템플릿이 없는 종류는 서버 문구, 그것도 없으면 일반 안내 문구를 쓴다', () => {
    const left = {
      messageType: 'SYSTEM' as const,
      notificationKind: 'MEMBER_LEFT' as 'APPEARANCE_REQUEST_SENT',
    }
    expect(notificationLine({ ...left, content: '고래님이 나갔습니다.' })).toBe(
      '고래님이 나갔습니다.',
    )
    expect(notificationLine({ ...left, content: '' })).toBe(
      '새 안내가 있습니다.',
    )
  })

  it('알림 템플릿은 시스템 안내에 쓰지 않는다(메시지 종류로 고른다)', () => {
    expect(
      notificationLine({
        messageType: 'SYSTEM',
        content: '',
        notificationKind: 'APPEARANCE_REQUEST_SENT',
        appearanceRequestSent: request,
      }),
    ).toBe('새 안내가 있습니다.')
  })
})
