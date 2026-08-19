export interface WhatsAppConfig {
  /** WAHA base URL (e.g. http://waha:3000 or http://localhost:3005) */
  wahaBaseUrl: string;
  /** WAHA API key for X-Api-Key header */
  wahaApiKey: string;
  /** WAHA session name (default: "default") */
  sessionName?: string;
  /** TTL for message dedup caches in ms (default: 300000 = 5 min) */
  cacheTtlMs?: number;
  /** Max entries per cache (default: 200) */
  cacheMaxSize?: number;
  /** TTL for contacts cache in ms (default: 300000 = 5 min) */
  contactsCacheTtlMs?: number;
  /** Max concurrent message handlers (default: 3) */
  concurrency?: number;
}
