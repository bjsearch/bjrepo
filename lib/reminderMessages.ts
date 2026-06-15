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
    '아직도 일기 안 썼냐? 이 시간까지 뭐 한 거야, 진짜.',
    '변명 좀 그만해. 핑계 댈 시간에 한 줄이라도 썼어야지.',
    '어제도 안 쓰고 오늘도 안 쓰면 그냥 포기한 거랑 똑같아. 정신 차려.',
    '딴짓할 시간은 있고 일기 쓸 시간은 없다? 웃기는 소리 하지 말고 당장 써.',
    '이러다 영어 실력 그대로 썩는다. 빨리 안 쓰고 뭐 하냐.',
    '또 미루고 있네. 그러다 작심삼일도 못 채운다, 진짜.',
    '입으로만 열심히 한다고 하지 말고 일기나 써, 좀.',
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
