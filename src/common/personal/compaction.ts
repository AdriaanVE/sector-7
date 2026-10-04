import * as z from 'zod/v4';
import type { DMessage } from '~/common/stores/chat/chat.message';

export const compactionItemSchema = z.object({ type: z.literal('compaction'), id: z.string().min(1), encrypted_content: z.string().min(1) });
export const compactionSchema = z.object({
  model: z.string(), deployment: z.string(), items: z.array(z.record(z.string(), z.unknown())), prefix: z.string().optional(),
});
export type Compaction = z.infer<typeof compactionSchema>;

/** Display history is preserved; the digest binds a checkpoint to exactly the context it covered. */
export async function compactionPrefix(model: string, system: DMessage, messages: readonly DMessage[]) {
  const value = JSON.stringify({ model, system: system.fragments.flatMap(fragment => 'part' in fragment ? [fragment.part] : []), messages: messages.map((message, index) => ({
    role: message.role, parts: message.fragments.flatMap(fragment => 'part' in fragment && fragment.part.pt !== 'ph' && fragment.part.pt !== 'annotations' && !(index === messages.length - 1 && fragment.part.pt === 'tool_response' && fragment.part.environment === 'client') ? [fragment.part] : []), metadata: message.metadata,
  })) });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
