export interface WhatsAppConfig {
  sessionPath: string;
  chromePath: string;
  /** TTL for message dedup caches in ms (default: 300000 = 5 min) */
  cacheTtlMs?: number;
  /** Max entries per cache (default: 200) */
  cacheMaxSize?: number;
  /** TTL for contacts cache in ms (default: 300000 = 5 min) */
  contactsCacheTtlMs?: number;
  /** Max concurrent message handlers (default: 3). Prevents Puppeteer saturation. */
  concurrency?: number;
}
