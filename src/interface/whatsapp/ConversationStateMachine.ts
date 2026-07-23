import { TTLCache } from "../../infrastructure/utils/ttl-cache.js";
import { env } from "../../infrastructure/config/env.js";
import type { TursoUserStateRepository } from "../../infrastructure/db/TursoUserStateRepository.js";

export type UserState = {
  context: string;
  data: Record<string, any>;
};

const DEFAULT_STATE: UserState = { context: "main", data: {} };

export class ConversationStateMachine {
  private userStates: TTLCache<string, UserState>;
  private stateRepo: TursoUserStateRepository | null = null;

  constructor(stateRepo?: TursoUserStateRepository) {
    this.stateRepo = stateRepo ?? null;
    this.userStates = new TTLCache({
      ttlMs: env.TTL_CACHE_USER_STATES,
      maxSize: 5000,
      cleanupIntervalMs: 300_000, // sweep every 5 min
    });
  }

  getState(sender: string): UserState {
    // Lazy cleanup: expired entries are removed on access
    return this.userStates.get(sender) ?? { ...DEFAULT_STATE };
  }

  setState(sender: string, state: UserState): void {
    this.userStates.set(sender, state);
    // Fire-and-forget persistence (non-blocking)
    this.persistState(sender, state).catch(() => {
      // Silently fail — in-memory state is authoritative
    });
  }

  reset(sender: string): void {
    this.userStates.delete(sender);
  }

  isWaiting(state: UserState): boolean {
    return state.context.includes("::waiting") || state.context.startsWith("waiting");
  }

  /** Return count of active (non-expired) user states */
  get activeStateCount(): number {
    return this.userStates.size;
  }

  /** Force cleanup of all expired entries. Returns removed count. */
  cleanup(): number {
    return this.userStates.cleanup();
  }

  /** Return cache statistics for monitoring */
  get stats() {
    return this.userStates.stats;
  }

  /**
   * Persist a single user state to DB (async, fire-and-forget).
   * If DB is unavailable, this is a no-op.
   */
  private async persistState(sender: string, state: UserState): Promise<void> {
    if (!this.stateRepo) return;
    await this.stateRepo.save(sender, state.context, state.data);
  }

  /**
   * Load all user states from DB into memory.
   * Also cleans up stale states older than 24h.
   * Call this once during application startup.
   */
  async loadFromDB(): Promise<number> {
    if (!this.stateRepo) {
      console.warn("[StateMachine] No state repository — running in memory-only mode");
      return 0;
    }

    try {
      // Delete stale states first (older than 24h)
      const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await this.stateRepo.deleteStale(staleBefore);

      // Load remaining states
      const states = await this.stateRepo.loadAll();
      let loaded = 0;
      for (const [userId, state] of states.entries()) {
        this.userStates.set(userId, state);
        loaded++;
      }

      console.log(`[StateMachine] Loaded ${loaded} user states from DB`);
      return loaded;
    } catch (err) {
      console.error(`[StateMachine] Failed to load states from DB: ${err}`);
      return 0;
    }
  }
}
