export interface AuthUser {
  id: string
  email: string
}

async function readJson(res: Response): Promise<any> {
  const raw = await res.text()
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me')
  const data = await readJson(res)
  return (data?.user as AuthUser) ?? null
}

export async function signup(email: string, password: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await readJson(res)
  if (!res.ok || !data?.user) {
    throw new Error(data?.error ?? `회원가입에 실패했습니다. (HTTP ${res.status})`)
  }
  return data.user as AuthUser
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await readJson(res)
  if (!res.ok || !data?.user) {
    throw new Error(data?.error ?? `로그인에 실패했습니다. (HTTP ${res.status})`)
  }
  return data.user as AuthUser
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' })
}
