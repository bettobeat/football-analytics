/** A same-site path to go to after sign-in; anything else ("//evil.com", "/\\evil.com", "https://…") becomes "/". */
export function safeNext(n: string | null | undefined): string {
  return n && /^\/(?![/\\])/.test(n) ? n : '/'
}
