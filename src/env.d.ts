/** Set at build time (vite.config.ts): package.json's version and the commit it was built from. */
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
/** True on Vercel preview builds (not production). */
declare const __PREVIEW__: boolean
