import webpush from 'web-push'
import { PushSubscriptionJSON } from './types'

let configured = false

function ensureConfigured() {
  if (configured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'
  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys are not configured')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

export interface ReminderPayload {
  title: string
  body: string
  url?: string
}

export async function sendPushNotification(sub: PushSubscriptionJSON, payload: ReminderPayload) {
  ensureConfigured()
  await webpush.sendNotification(sub, JSON.stringify(payload))
}

export { webpush }
