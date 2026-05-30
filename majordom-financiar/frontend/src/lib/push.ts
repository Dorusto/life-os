/**
 * Web Push subscription management.
 *
 * Flow:
 *   1. requestAndSubscribe() — called once after login
 *   2. Browser asks for notification permission (first time only)
 *   3. SW subscribes to the push server using the VAPID public key from the API
 *   4. Subscription (endpoint + keys) is sent to POST /api/push/subscribe
 *   5. Backend stores it — APScheduler will use it to deliver daily notifications
 */

import { getToken } from './auth'

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const buffer = new ArrayBuffer(raw.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i)
  return view
}

async function getVapidPublicKey(): Promise<string> {
  const res = await fetch('/api/push/vapid-public-key')
  if (!res.ok) throw new Error('Could not fetch VAPID public key')
  const data = await res.json()
  return data.public_key
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  const token = getToken()
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      user_agent: navigator.userAgent,
    }),
  })
}

async function subscribeToPush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()

  if (existing) {
    // Always sync to backend — handles DB-cleared scenarios without resubscribing
    await saveSubscription(existing)
    return
  }

  const publicKey = await getVapidPublicKey()
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
  await saveSubscription(subscription)
}

export type PermissionResult = 'granted' | 'denied' | 'unsupported'

export async function requestAndSubscribe(): Promise<PermissionResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }

  if (Notification.permission === 'denied') return 'denied'

  if (Notification.permission !== 'granted') {
    const result = await Notification.requestPermission()
    if (result !== 'granted') return 'denied'
  }

  try {
    await subscribeToPush()
  } catch (err) {
    console.warn('Push subscription failed:', err)
  }
  return 'granted'
}
