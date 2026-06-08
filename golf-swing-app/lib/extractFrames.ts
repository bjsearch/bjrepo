/**
 * Extracts evenly-spaced JPEG frames from a video file using an off-screen
 * <video> + <canvas>. Returns base64-encoded JPEG strings (no data: prefix).
 *
 * Frames are downscaled to MAX_DIMENSION so the resulting payload stays well
 * under serverless request-body limits (e.g. Netlify Functions ~6MB) and the
 * vision model responds quickly.
 */
const MAX_DIMENSION = 480

export async function extractFrames(
  file: File,
  frameCount = 6,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('영상을 불러오지 못했습니다.'))
    })

    const duration = video.duration
    if (!isFinite(duration) || duration <= 0) {
      throw new Error('영상 길이를 확인할 수 없습니다.')
    }

    const scale = Math.min(1, MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('캔버스를 생성할 수 없습니다.')

    const frames: string[] = []
    for (let i = 0; i < frameCount; i++) {
      const t = (duration * (i + 0.5)) / frameCount
      await seekTo(video, t)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
      frames.push(dataUrl.replace(/^data:image\/jpeg;base64,/, ''))
      onProgress?.(i + 1, frameCount)
    }

    return frames
  } finally {
    URL.revokeObjectURL(url)
  }
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      reject(new Error('프레임 추출 중 오류가 발생했습니다.'))
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.currentTime = time
  })
}
