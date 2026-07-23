// Vitest doesn't apply the "react-server" export condition Next.js uses to
// resolve `server-only` to a no-op in Server Components — aliased here so
// importing server-only modules in tests doesn't throw.
export {};
