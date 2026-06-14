import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

const CCTV_STREAM_URL = process.env.CCTV_STREAM_URL

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!CCTV_STREAM_URL) {
    return NextResponse.json({ error: 'CCTV stream is not configured' }, { status: 503 })
  }

  const { path } = await params
  const targetUrl = `${CCTV_STREAM_URL.replace(/\/$/, '')}/${path.join('/')}`

  let upstream: Response
  try {
    upstream = await fetch(targetUrl, { cache: 'no-store' })
  } catch {
    return NextResponse.json({ error: 'CCTV stream is unreachable' }, { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'CCTV stream is unavailable' }, { status: 502 })
  }

  const filename = path[path.length - 1] || ''
  const contentType =
    upstream.headers.get('content-type') ||
    (filename.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t')

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    },
  })
}
