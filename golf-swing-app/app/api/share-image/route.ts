import { NextResponse } from 'next/server'
import { getStore } from '@netlify/blobs'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB
const ALLOWED_HOSTS = ['carry-coach.netlify.app', 'localhost:3000']

export async function POST(req: Request) {
  try {
    const { image } = await req.json()
    if (typeof image !== 'string' || !image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Invalid image data' }, { status: 400 })
    }

    const base64 = image.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')

    if (buffer.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 })
    }

    const uint8 = new Uint8Array(buffer)
    const id = `share-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
    const store = getStore('share-images')
    await store.set(id, new Blob([uint8], { type: 'image/png' }), { metadata: { contentType: 'image/png', createdAt: new Date().toISOString() } })

    const host = req.headers.get('host') || new URL(req.url).host
    const safeHost = ALLOWED_HOSTS.includes(host) ? host : ALLOWED_HOSTS[0]
    const proto = safeHost.startsWith('localhost') ? 'http' : 'https'
    const url = `${proto}://${safeHost}/api/share-image/${id}`

    return NextResponse.json({ url })
  } catch (err) {
    console.error('share-image upload error', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
