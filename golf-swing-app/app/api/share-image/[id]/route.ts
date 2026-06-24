import { NextResponse } from 'next/server'
import { getStore } from '@netlify/blobs'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const store = getStore('share-images')
    const blob = await store.get(params.id, { type: 'arrayBuffer' })
    if (!blob) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err) {
    console.error('share-image get error', err)
    return NextResponse.json({ error: 'Failed to retrieve image' }, { status: 500 })
  }
}
