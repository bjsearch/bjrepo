import { ClubProfileEntry, WatchTelemetry } from './types'

// Target device has no display (e.g. standard Ray-Ban Meta / Oakley Meta glasses,
// audio + camera only — no lens display, no Neural Band). Every piece of
// information this app produces has to be said out loud through the glasses'
// open-ear speakers rather than shown on a screen. In this web demo that means
// the browser's speechSynthesis; on real hardware it would route through the
// Meta Wearables Device Access Toolkit's audio/notification channel instead.
export function speak(text: string, interrupt = true) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  if (interrupt) window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ko-KR'
  window.speechSynthesis.speak(utterance)
}

export function holeAnnouncement(telemetry: WatchTelemetry): string {
  return `${telemetry.holeNumber}번 홀, 핀까지 ${telemetry.distanceToPinCenter}미터 남았습니다.`
}

export function shotAnnouncement(distanceMeters: number): string {
  return `직전 샷 거리, ${distanceMeters}미터.`
}

export function distanceAnnouncement(telemetry: WatchTelemetry): string {
  return `핀까지 ${telemetry.distanceToPinCenter}미터. 전면 ${telemetry.distanceToPinFront}미터, 후면 ${telemetry.distanceToPinBack}미터.`
}

export function clubAnnouncement(club: ClubProfileEntry | null): string {
  return club ? `추천 클럽은 ${club.label}입니다.` : '거리 정보가 없어 클럽을 추천할 수 없어요.'
}
