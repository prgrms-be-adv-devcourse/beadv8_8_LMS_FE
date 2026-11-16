import { describe, expect, it } from 'vitest'
import { parseHighlight } from './highlight'

describe('parseHighlight', () => {
  it('<em>으로 감싼 말만 강조 조각이 된다', () => {
    expect(parseHighlight('<em>프리미어</em> 컷편집 입문')).toEqual([
      { text: '프리미어', hit: true },
      { text: ' 컷편집 입문', hit: false },
    ])
  })

  it('escape 문자는 원래 글자로 바꾼다', () => {
    expect(
      parseHighlight('&quot;빠르게&quot; &amp; &lt;쉽게&gt; <em>R&amp;D</em>'),
    ).toEqual([
      { text: '"빠르게" & <쉽게> ', hit: false },
      { text: 'R&D', hit: true },
    ])
  })

  it('<em> 말고 다른 태그는 글로만 남기고 실행하지 않는다', () => {
    const parts = parseHighlight(
      '<img src=x onerror="alert(1)">안녕 <b>굵게</b><script>alert(2)</script>',
    )
    expect(parts).toEqual([{ text: '안녕 굵게alert(2)', hit: false }])
  })

  it('escape된 태그 모양은 글자 그대로 보인다', () => {
    expect(parseHighlight('&lt;em&gt;가짜&lt;/em&gt; <em>진짜</em>')).toEqual([
      { text: '<em>가짜</em> ', hit: false },
      { text: '진짜', hit: true },
    ])
  })
})
