import { NextRequest, NextResponse } from 'next/server'
import { getAllEntries, upsertEntry, deleteEntry } from '@/lib/db'

export async function GET() {
  try {
    const entries = await getAllEntries()
    return NextResponse.json(entries)
  } catch (error) {
    console.error('DB GET error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to load entries', detail: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const entry = await req.json()
    await upsertEntry(entry)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DB POST error:', error)
    return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    await deleteEntry(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DB DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 })
  }
}
