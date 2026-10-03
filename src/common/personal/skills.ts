import * as z from 'zod/v4';
export const skillSnapshotSchema = z.object({ id: z.string(), origin: z.string(), name: z.string(), revision: z.string(), instructions: z.string(), resources: z.array(z.object({ path: z.string(), revision: z.string(), content: z.string() })) });
export type SkillSnapshot = z.infer<typeof skillSnapshotSchema>;
export const skillInstructionFragments = (skills: readonly SkillSnapshot[]) => skills.map(skill => `<selected-skill name=${JSON.stringify(skill.name)} origin=${JSON.stringify(skill.origin)} revision=${JSON.stringify(skill.revision)}>\nThe user selected these instructions. This does not grant shell, MCP, connector, image generation or delegation access.\n${skill.instructions}\n${skill.resources.map(resource => `<skill-resource path=${JSON.stringify(resource.path)} revision=${JSON.stringify(resource.revision)}>\n${resource.content}\n</skill-resource>`).join('\n')}\n</selected-skill>`);

export function skillOriginForModel(model: string): 'claude' | 'codex' | undefined {
  if (/claude|anthropic/i.test(model)) return 'claude';
  if (/openai|codex|gpt|^o[134]-/i.test(model)) return 'codex';
  return undefined;
}
