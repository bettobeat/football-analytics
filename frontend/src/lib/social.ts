/**
 * Our social accounts (fix134), the one list for the site's footer. The crawler side (Organization JSON-LD sameAs)
 * keeps the same URLs in backend/src/services/seo.ts SOCIAL_URLS — change both together.
 * url null = not live yet (hidden in the footer, left out of sameAs).
 */
export type SocialId = 'instagram' | 'x' | 'tiktok'

export const SOCIAL: { id: SocialId; name: string; url: string | null }[] = [
  { id: 'instagram', name: 'Instagram', url: 'https://instagram.com/sportlikely' },
  { id: 'x', name: 'X', url: 'https://x.com/sportlikely' },
  // TODO: TikTok URL once Yarin sends the @handle (then add it to SOCIAL_URLS in seo.ts too)
  { id: 'tiktok', name: 'TikTok', url: null }
]
