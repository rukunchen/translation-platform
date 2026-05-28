export const PUBLIC_PATHS = ['/', '/invite']

export function isPublic(pathname: string) {
  if (!pathname) return false
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}
