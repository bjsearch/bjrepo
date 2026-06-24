import { NextResponse } from 'next/server'
import { getStore } from '@netlify/blobs'

export async function POST(req: Request) {
  try {
    const { image } = await req.json()
    if (typeof image !== 'string' || !image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Invalid image data' }, { status: 400 })
    }

    const base64 = image.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')
    const uint8 = new Uint8Array(buffer)

    const id = `share-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const store = getStore('share-images')
    await store.set(id, new Blob([uint8], { type: 'image/png' }), { metadata: { contentType: 'image/png', createdAt: new Date().toISOString() } })

    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host
    const proto = req.headers.get('x-forwarded-proto') || 'https'
    const origin = `${proto}://${host}`
    const url = `${origin}/api/share-image/${id}`

    return NextResponse.json({ url })
  } catch (err) {
    console.error('share-image upload error', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
