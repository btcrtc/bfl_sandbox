declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    BFL_API_KEY?: string;
    DAILY_RUN_LIMIT?: string;
  }
}
