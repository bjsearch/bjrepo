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
    '아직도 일기 안 썼냐?\n솔직히 말해봐, 오늘도 유튜브 보면서 시간 다 날린 거지?\n그러면서 영어 잘하고 싶다고? 웃기지 마.\n지금 당장 열어서 한 줄이라도 써.',
    '또 안 쓰고 하루 넘기려고?\n어제도 안 썼고 오늘도 이러면 그냥 포기한 거야.\n\"내일부터 해야지\" 그 내일은 절대 안 와.\n변명 그만하고 지금 써.',
    '진짜 물어볼게 하나 있어.\n영어 일기 쓴다고 해놓고 며칠째 안 쓰는 거야?\n그 의지력으로 뭘 이루겠다고?\n아직 늦지 않았으니까 지금이라도 당장 열어.',
    '딴짓할 시간은 넘쳐나면서\n일기 쓸 5분은 없다?\n스스로한테 거짓말하는 거 이제 그만하자.\n핸드폰 내려놓고 일기 앱 열어. 지금.',
    '하루에 영어 세 줄도 못 쓰는 사람이\n무슨 영어 공부를 한다는 거야.\n작심삼일도 아니고 작심하루도 못 하잖아.\n증명해봐. 오늘은 다르다는 거.',
    '솔직히 이대로면 1년 뒤에도 지금이랑 똑같아.\n아니, 더 후회하고 있을 걸.\n\"그때라도 할 걸\" 하면서.\n그 \"그때\"가 바로 지금이야. 일기 써.',
    '매일 한다면서 벌써 빼먹으려고?\n그렇게 쉽게 약속 깨는 사람이\n다른 건 뭘 제대로 하겠어.\n자존심 있으면 지금 열어서 써.',
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
