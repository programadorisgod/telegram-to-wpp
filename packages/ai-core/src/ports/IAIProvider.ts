export interface ChatOptions {
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface IAIProvider {
  /** Send a prompt and stream the response chunk by chunk. */
  chat(prompt: string, options?: ChatOptions): AsyncIterable<string>;

  /** Optional: non-streaming convenience for simple use cases. */
  chatSync?(prompt: string, options?: ChatOptions): Promise<string>;
}

/** Registry of available provider constructors. */
export type ProviderConstructor = new (...args: any[]) => IAIProvider;
