declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    BFL_API_KEY?: string;
    DAILY_RUN_LIMIT?: string;
    VIDEO_ENABLED?: string;
    VIDEO_DAILY_LIMIT?: string;
    MISTRAL_API_KEY?: string;
    // Enables the explicit, cookie-backed portfolio sign-in when the app is
    // running without ChatGPT's trusted identity headers.
    DEMO_MODE?: string;
    AUTH_SECRET?: string;
  }
}
