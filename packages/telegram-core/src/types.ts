export interface ReplyInfo {
  text: string;
  fromName: string;
  isFromBot?: boolean;
}

export interface TelegramConfig {
  botToken: string;
  groupId: number;
  onMessage?: (text: string, fromName: string, replyTo?: ReplyInfo) => void;
}
