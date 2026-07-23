export interface ReplyContext {
  text: string;
  /** The sender ID of the original message (e.g. phone number) */
  from?: string;
}

export interface IMessageHandler {
  handle(text: string, sender: string, replyContext?: ReplyContext): Promise<void>;
}
