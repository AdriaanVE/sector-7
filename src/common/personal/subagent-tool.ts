import * as z from 'zod/v4';
import type { AixTools_ToolDefinition } from '~/modules/aix/server/api/aix.wiretypes';
import { CHAT_EFFORTS, CHAT_MODELS } from './chat-config';

export const subagentInput = z.object({
  prompt: z.string().trim().min(1).max(64000),
  description: z.string().trim().min(1).max(120),
  model: z.enum(CHAT_MODELS).default('gpt-6.1-sol'),
  effort: z.enum(CHAT_EFFORTS).default('medium'),
});

export const continueAgentInput = z.object({
  conversationId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  message: z.string().trim().min(1).max(64000),
});

export const continueAgentTool: AixTools_ToolDefinition = {
  type: 'function_call',
  function_call: {
    name: 'continue_agent',
    description: 'Continue one of this chat\'s saved subagents using its returned conversationId and a follow-up message. Reuses its history and completed tool results. Use for incomplete tasks or follow-up work instead of spawning a replacement. Waits for completion. Cannot continue another parent\'s child or a running child.',
    input_schema: {
      properties: { conversationId: { type: 'string' }, message: { type: 'string', description: 'Follow-up task or guidance for the existing child.' } },
      required: ['conversationId', 'message'],
    },
  },
};

export const subagentTool: AixTools_ToolDefinition = {
  type: 'function_call',
  function_call: {
    name: 'spawn_agent',
    description: 'Delegate a bounded task to an isolated subagent chat, default GPT-6.1 Sol. Supply the task and all needed context. It inherits personal/project instructions and local file/terminal access. Waits for completion and returns the result and child conversation ID. Use only when the user asks for delegation or applicable instructions request it. Child agents cannot spawn agents. Prefer independent read tasks; coordinate writes to shared files.',
    input_schema: {
      properties: {
        prompt: { type: 'string', description: 'Self-contained task and context; parent history is not copied.' },
        description: { type: 'string', description: 'Short task title.' },
        model: { type: 'string', enum: [...CHAT_MODELS], description: 'Defaults to gpt-6.1-sol.' },
        effort: { type: 'string', enum: [...CHAT_EFFORTS], description: 'Defaults to medium.' },
      },
      required: ['prompt', 'description'],
    },
  },
};
