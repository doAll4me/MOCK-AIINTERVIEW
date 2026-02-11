export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SessionDate {
  sessionId: string;
  userId: string;
  position: string;
  message: Message[];
  createdAt: Date;
  lastActivityAt: Date;
}
