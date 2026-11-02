/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** '1' in the suite's builds only (playwright.config.ts): Bug Sweep exposes its test handle. */
  readonly PUBLIC_TEST_HOOKS?: string;
}
