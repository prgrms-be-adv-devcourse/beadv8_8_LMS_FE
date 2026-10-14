export function readCookie(name: string): string | null {
  const prefix = `${name}=`
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix))
      return decodeURIComponent(part.slice(prefix.length))
  }
  return null
}
