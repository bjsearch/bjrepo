export type ReminderTone = 'provocative' | 'teacher' | 'friend' | 'parent'

export const DEFAULT_REMINDER_TONE: ReminderTone = 'friend'

export const REMINDER_TONES: { value: ReminderTone; label: string; description: string; emoji: string }[] = [
  { value: 'provocative', label: '자극적인 메시지', description: '따끔하게 동기부여 해줘요', emoji: '😈' },
  { value: 'teacher', label: '선생님같은 메시지', description: '차분하게 학습을 독려해요', emoji: '🧑‍🏫' },
  { value: 'friend', label: '친구같은 메시지', description: '편하게 챙겨주듯 알려줘요', emoji: '🙂' },
  { value: 'parent', label: '부모님같은 메시지', description: '따뜻하게 다독여줘요', emoji: '🥰' },
]

const MESSAGES: Record<ReminderTone, string[]> = {
  provocative: [],
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

const PROVOCATIVE_BY_MISSED: string[][] = [
  // 0일: 오늘 아직 안 씀 (레벨 5-6)
  [
    '오늘 일기 아직 안 썼지?\n하루가 끝나기 전에 딱 5분만 투자해봐.\n그 5분이 1년 뒤 너를 바꾼다.\n지금 열어.',
    '아직 오늘 일기 안 썼네.\n바쁜 건 알지만 핑계 대기 시작하면 끝이 없어.\n오늘 하루를 영어로 정리해봐.\n어렵지 않잖아, 세 줄이면 돼.',
    '오늘도 \"나중에 써야지\" 하고 있지?\n그 나중은 안 와, 매번 그랬잖아.\n지금 열어서 한 줄이라도 적어.',
  ],
  // 1일 밀림 (레벨 6-7)
  [
    '어제 일기 안 쓴 거 알지?\n하루 빼먹으면 이틀, 이틀이면 일주일이야.\n아직 늦지 않았으니까 오늘은 꼭 써.\n어제 일 포함해서 두 줄이라도.',
    '어제도 안 썼더라.\n한 번 빼먹으면 습관이 무너지기 시작하는 거야.\n오늘까지 안 쓰면 진짜 위험해.\n지금 바로 열어.',
    '벌써 하루 밀렸어.\n\"어제 바빴으니까\" 그 변명 또 할 거야?\n오늘은 바쁘지 않잖아. 지금 써.\n안 그러면 내일도 똑같아.',
  ],
  // 2일 밀림 (레벨 7-8)
  [
    '이틀째 일기를 안 쓰고 있어.\n솔직히 영어 공부 포기한 거 아니야?\n아니라고? 그러면 증명해.\n지금 당장 열어서 오늘 일기 써.',
    '2일 연속으로 안 썼네.\n이러다 일주일 금방이야, 경험상 알잖아.\n작심삼일이라는 말 들어봤지?\n내일이면 딱 그 꼴이야. 오늘은 써.',
    '이틀이나 밀렸으면서\n아직도 \"영어 공부 중\"이라고 말할 수 있어?\n말로만 하는 거 이제 지겹지 않아?\n입 다물고 일기 앱 열어.',
  ],
  // 3일+ 밀림 (레벨 9-10)
  [
    '며칠째 일기를 안 쓰고 있는 거야?\n이건 깜빡한 게 아니라 도망치는 거야.\n그러면서 영어 잘하고 싶다고?\n거울 보고 말해봐, 부끄럽지도 않냐.\n지금 안 쓰면 진짜 끝이다.',
    '벌써 며칠이야?\n솔직히 넌 영어 공부 포기한 거야.\n아니라고? 며칠째 한 줄도 안 썼으면서?\n행동이 말보다 솔직한 법이야.\n지금 이 순간이 마지막 기회라고 생각해.',
    '대체 며칠째 안 쓰는 거야?\n유튜브 볼 시간, SNS 할 시간은 다 있으면서\n영어 일기 쓸 3분은 없다?\n스스로한테 거짓말하는 것도 이제 한계 있지 않아?\n진짜 바꾸고 싶으면 지금 당장 열어.',
    '솔직히 말할게.\n며칠째 안 쓰는 너한테 알림 보내는 게 의미가 있나 싶어.\n근데 그래도 보내는 건 아직 가능성이 있다고 보니까야.\n이 메시지 무시하면 그냥 포기한 거야.\n읽었으면 지금 바로 써.',
    '이대로면 1년 뒤에도 지금이랑 똑같아.\n아니, 더 후회하고 있을 걸.\n\"그때라도 할 걸\" 하면서 또 한숨 쉬겠지.\n그 \"그때\"가 바로 지금이야.\n제발 정신 차리고 일기 써.',
  ],
]

export function getReminderMessage(tone: string | null | undefined, missedDays?: number): string {
  const validTone = isValidReminderTone(tone) ? tone : DEFAULT_REMINDER_TONE

  if (validTone === 'provocative' && missedDays !== undefined) {
    const tier = Math.min(missedDays, 3)
    const pool = PROVOCATIVE_BY_MISSED[tier]
    return pool[Math.floor(Math.random() * pool.length)]
  }

  const messages = MESSAGES[validTone]
  return messages[Math.floor(Math.random() * messages.length)]
}
