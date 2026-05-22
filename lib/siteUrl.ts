const LOCAL_SITE_URL = 'http://localhost:3000'

export function getSiteUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const siteUrl = configuredUrl || (process.env.NODE_ENV === 'production' ? '' : LOCAL_SITE_URL)

  if (!siteUrl) {
    throw new Error('NEXT_PUBLIC_SITE_URL is required to generate production site links.')
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(siteUrl)
  } catch {
    throw new Error('NEXT_PUBLIC_SITE_URL must be an absolute URL.')
  }

  return parsedUrl.toString().replace(/\/$/, '')
}

export function getInviteUrl(token: string): string {
  return `${getSiteUrl()}/invite/${token}`
}
