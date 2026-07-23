import type { IAIProvider, ChatOptions } from "../ports/IAIProvider.js";

// Only typed, not eagerly imported — consumer must install the peer dep.
type MidAIInstance = {
    chat(prompt: string): Promise<AsyncGenerator<string, any, any>>;
};

interface MidAIConstructor {
    new (config?: Record<string, any>): MidAIInstance;
}

/**
 * Wrap a promise with a timeout. Rejects if the promise doesn't settle
 * within `timeoutMs` milliseconds.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId!);
    });
}

export class MidAIProvider implements IAIProvider {
    private client: MidAIInstance | null = null;
    private pendingInit: Promise<void> | null = null;

    /**
     * @param config Configuration passed directly to `new MidAI(config)`.
     * @param MidAI  Optional constructor override (useful for testing or lazy loading).
     * @param timeoutMs Optional timeout in ms for chatSync calls (default: 30000).
     */
    constructor(
        private config?: Record<string, any>,
        private MidAIOverride?: new (...args: any[]) => MidAIInstance,
        private timeoutMs: number = 30_000,
    ) {}

    async *chat(prompt: string, _options?: ChatOptions): AsyncIterable<string> {
        await this.ensureInit();
        const response = await this.client!.chat(prompt);
        for await (const chunk of response) {
            yield chunk;
        }
    }

    async chatSync(prompt: string, _options?: ChatOptions): Promise<string> {
        let result = "";
        for await (const chunk of this.chat(prompt, _options)) {
            result += chunk;
        }
        return result;
    }

    /**
     * chatSync with timeout protection.
     * Rejects if the full response isn't received within timeoutMs.
     */
    async chatSyncWithTimeout(prompt: string, _options?: ChatOptions): Promise<string> {
        return withTimeout(
            this.chatSync(prompt, _options),
            this.timeoutMs,
            "AI chat",
        );
    }

    private async ensureInit(): Promise<void> {
        if (this.client) return;
        if (this.pendingInit) {
            await this.pendingInit;
            return;
        }

        if (this.MidAIOverride) {
            this.client = new this.MidAIOverride(this.config);
            return;
        }

        this.pendingInit = this.loadMidAI();
        await this.pendingInit;
    }

    private async loadMidAI(): Promise<void> {
        try {
            const mod = await import("@camidevv/mid-ai") as unknown as {
                MidAI: MidAIConstructor;
            };
            this.client = new mod.MidAI(this.config);
        } catch {
            throw new Error(
                "MidAIProvider requires @camidevv/mid-ai to be installed. " +
                    "Run: pnpm add @camidevv/mid-ai",
            );
        }
    }
}
