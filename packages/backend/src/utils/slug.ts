const MAX_SLUG_LENGTH = 64;

export function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
}
