/** 검색 강조 조각. hit이면 검색어가 걸린 말이다 */
export type HighlightPart = { text: string; hit: boolean }

/**
 * 검색 API의 highlights 값(서버가 escape한 HTML에 걸린 말만 <em>으로 감쌈)을 글 조각으로 나눈다.
 * innerHTML로 넣지 않고 DOMParser(스크립트를 돌리지 않고 이미지도 불러오지 않는 문서)로 읽어,
 * &quot; 같은 escape 문자는 원래 글자로 바꾸고 <em> 말고 다른 태그가 오면 태그는 버리고 글만 남긴다.
 */
export function parseHighlight(html: string): HighlightPart[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const parts: HighlightPart[] = []
  const push = (text: string, hit: boolean) => {
    if (!text) return
    const last = parts.at(-1)
    if (last && last.hit === hit) last.text += text
    else parts.push({ text, hit })
  }
  for (const node of doc.body.childNodes) {
    const hit = node.nodeName === 'EM'
    push(node.textContent ?? '', hit)
  }
  return parts
}
