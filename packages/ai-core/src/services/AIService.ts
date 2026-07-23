import type { IAIProvider, ChatOptions } from "../ports/IAIProvider";

/**
 * High-level service that wraps any IAIProvider with convenience methods.
 *
 * Use this directly in your app — or ignore it and wire IAIProvider yourself.
 */
export class AIService {
  constructor(private provider: IAIProvider) {}

  /** Stream a chat response. */
  async *chat(prompt: string, options?: ChatOptions): AsyncIterable<string> {
    yield* this.provider.chat(prompt, options);
  }

  /** Get the full response as a single string. */
  async chatSync(prompt: string, options?: ChatOptions): Promise<string> {
    if (this.provider.chatSync) {
      return this.provider.chatSync(prompt, options);
    }

    let result = "";
    for await (const chunk of this.provider.chat(prompt, options)) {
      result += chunk;
    }
    return result;
  }
}
