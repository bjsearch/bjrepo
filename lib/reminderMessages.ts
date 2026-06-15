export type ReminderTone = 'provocative' | 'teacher' | 'friend' | 'parent'

export const DEFAULT_REMINDER_TONE: ReminderTone = 'friend'

export const REMINDER_TONES: { value: ReminderTone; label: string; description: string; emoji: string }[] = [
  { value: 'provocative', label: '자극적인 메시지', description: '따끔하게 동기부여 해줘요', emoji: '😈' },
  { value: 'teacher', label: '선생님같은 메시지', description: '차분하게 학습을 독려해요', emoji: '🧑‍🏫' },
  { value: 'friend', label: '친구같은 메시지', description: '편하게 챙겨주듯 알려줘요', emoji: '🙂' },
  { value: 'parent', label: '부모님같은 메시지', description: '따뜻하게 다독여줘요', emoji: '🥰' },
]

const MESSAGES: Record<ReminderTone, string[]> = {
  provocative: [
    '아직도 일기 안 썼어?! 오늘 안 쓰면 내일 두 배로 써야 해!',
    '변명은 그만! 지금 당장 일기 쓰러 가자.',
    '어제보다 나아지고 싶다며? 그럼 지금 써야지!',
    '딴짓 그만하고 영어 일기부터! 시간 없다고 하지 마.',
    '오늘도 안 쓰면 영어 실력은 그대로야. 지금 시작해!',
  ],
  teacher: [
    '오늘 배운 표현, 일기에 적용해볼까요? 잊지 말고 작성해주세요.',
    '꾸준함이 실력의 비결이에요. 오늘의 일기를 작성해볼까요?',
    '어제의 일을 영어로 정리하며 복습하는 시간을 가져보세요.',
    '작은 실천이 큰 변화를 만듭니다. 오늘도 일기를 써볼까요?',
    '오늘의 학습 목표는 영어 일기 작성이에요. 함께 시작해볼까요?',
  ],
  friend: [
    '야~ 오늘 일기 썼어? 같이 영어 실력 키워보자! ㅎㅎ',
    '오늘 하루 어땠어? 영어로 살짝 적어볼까~',
    '잊지 말고 일기 쓰자! 내가 옆에서 응원할게 ㅎㅎ',
    '심심한데 같이 영어 일기 쓰러 갈까?',
    '오늘도 같이 으쌰으쌰! 일기 쓰는 거 잊지 마~',
  ],
  parent: [
    '오늘 하루도 고생했어. 잠깐 시간 내서 일기 쓰고 푹 쉬어~',
    '오늘 있었던 일, 영어로 한번 적어보는 거 잊지 않았지?',
    '우리 아이, 오늘도 애썼다. 일기 쓰는 거 잊지 말고.',
    '꾸준히 하는 모습이 참 보기 좋아. 오늘도 일기 써볼까?',
    '늦지 않게 일기 쓰고 일찍 자렴. 항상 응원해.',
  ],
}

export function isValidReminderTone(tone: unknown): tone is ReminderTone {
  return typeof tone === 'string' && tone in MESSAGES
}

export function getReminderMessage(tone: string | null | undefined): string {
  const messages = MESSAGES[isValidReminderTone(tone) ? tone : DEFAULT_REMINDER_TONE]
  return messages[Math.floor(Math.random() * messages.length)]
}
