import { createHash } from 'node:crypto';

/** Short stable hash used for socket-hash and project-hash directory names. */
export function shortHash(input: string, len = 12): string {
  return createHash('sha256').update(input).digest('hex').slice(0, len);
}
