declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    BFL_API_KEY?: string;
    DAILY_RUN_LIMIT?: string;
    VIDEO_ENABLED?: string;
    VIDEO_DAILY_LIMIT?: string;
    MISTRAL_API_KEY?: string;
    // 'true' signs visitors into a shared demo workspace when no platform
    // auth headers are present — for standalone demo deployments only.
    DEMO_MODE?: string;
  }
}
