import * as z from 'zod/v4';
import type { DMessageFragment } from '~/common/stores/chat/chat.fragments';

const json: z.ZodType<unknown> = z.lazy(() => z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(json), z.record(z.string(), json)]));
/** Native blocks are durable ordered protocol content, including encrypted and unknown nested JSON. */
const block = z.object({ type: z.string().min(1) }).catchall(json).superRefine((value, context) => {
  const required = value.type === 'text' ? ['text'] : value.type === 'thinking' ? ['thinking', 'signature']
    : value.type === 'redacted_thinking' ? ['data'] : value.type === 'tool_use' || value.type === 'server_tool_use' ? ['id', 'name']
      : value.type.endsWith('_tool_result') ? ['tool_use_id'] : [];
  for (const key of required) if (typeof value[key] !== 'string') context.addIssue({ code: 'custom', path: [key], message: `Native ${value.type} requires ${key}.` });
  if ((value.type === 'tool_use' || value.type === 'server_tool_use') && (!value.input || typeof value.input !== 'object' || Array.isArray(value.input)))
    context.addIssue({ code: 'custom', path: ['input'], message: 'Native tool input must be an object.' });
  if (value.type.endsWith('_tool_result') && (!value.content || typeof value.content !== 'object'))
    context.addIssue({ code: 'custom', path: ['content'], message: 'Native tool result requires content.' });
});
export const nativeHistorySchema = z.object({
  provider: z.literal('anthropic-messages'), deployment: z.string().min(1), model: z.string().min(1), projection: z.string(), requestPrefix: z.string().optional(),
  segments: z.array(z.object({ id: z.string().min(1), content: z.array(block) })),
});
export type NativeHistory = z.infer<typeof nativeHistorySchema>;

/** Ignore display-only annotations/progress and subsequently appended client answers. */
export function nativeHistoryProjection(fragments: readonly DMessageFragment[]): string {
  return JSON.stringify(fragments.flatMap(f => 'part' in f && !['ph', 'annotations', 'tool_response', '_pt_sentinel'].includes(f.part.pt) ? [f.part] : []));
}
export function eligibleNativeHistory(history: NativeHistory | undefined, fragments: readonly DMessageFragment[]): NativeHistory | undefined {
  return history?.projection === nativeHistoryProjection(fragments) ? history : undefined;
}
