const DEFAULT_APP_URL = 'https://bjrepo.vercel.app'

export function getAppUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) return envUrl.replace(/\/$/, '')
  return DEFAULT_APP_URL
}
