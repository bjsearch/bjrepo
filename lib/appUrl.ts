export function getAppUrl(req: { url: string }): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL
  if (envUrl) return envUrl.replace(/\/$/, '')
  return new URL('/', req.url).toString().replace(/\/$/, '')
}
