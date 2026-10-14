const formatter = new Intl.NumberFormat('ko-KR')

/** 1,234,000 형태. 단위(HP·원)는 부르는 쪽에서 붙인다. */
export function formatNumber(value: number): string {
  return formatter.format(value)
}
