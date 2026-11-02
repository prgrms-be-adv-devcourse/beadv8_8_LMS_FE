import { describe, expect, it } from 'vitest'
import { emailError, passwordError } from './password'

describe('passwordError (BE Password와 같은 순서·문구)', () => {
  it.each([
    ['abc1', '비밀번호는 8~64자로 입력해 주세요.'],
    ['a1'.repeat(33), '비밀번호는 8~64자로 입력해 주세요.'],
    [
      'abcd 1234',
      '비밀번호는 영문·숫자·특수문자만 쓸 수 있습니다. 공백과 한글은 쓸 수 없습니다.',
    ],
    [
      '비밀번호abcd1',
      '비밀번호는 영문·숫자·특수문자만 쓸 수 있습니다. 공백과 한글은 쓸 수 없습니다.',
    ],
    ['abcdefgh', '비밀번호에 영문과 숫자를 하나 이상씩 넣어 주세요.'],
    ['12345678', '비밀번호에 영문과 숫자를 하나 이상씩 넣어 주세요.'],
  ])('%s → %s', (password, message) => {
    expect(passwordError(password)).toBe(message)
  })

  it('규칙에 맞으면 null(키보드 특수문자는 된다)', () => {
    expect(passwordError('abcd1234')).toBeNull()
    expect(passwordError('a1!@#$%^&*()_+{}~')).toBeNull()
    expect(passwordError('a1'.repeat(32))).toBeNull()
  })
})

describe('emailError', () => {
  it.each([
    ['', '이메일을 입력해 주세요.'],
    ['  ', '이메일을 입력해 주세요.'],
    ['a@b', '이메일 형식이 올바르지 않습니다.'],
    ['a b@c.d', '이메일 형식이 올바르지 않습니다.'],
    [`${'a'.repeat(251)}@b.cd`, '이메일은 255자 이하로 입력해 주세요.'],
  ])('%j → %s', (email, message) => {
    expect(emailError(email)).toBe(message)
  })

  it('형식이 맞으면 null(앞뒤 공백은 BE가 지운다)', () => {
    expect(emailError(' user@hapbang.kr ')).toBeNull()
  })
})
