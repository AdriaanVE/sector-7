import * as z from 'zod/v4';

export const artifactSourceSchema = z.object({
  provider: z.enum(['anthropic', 'openai-container']), deployment: z.string().min(1),
  fileId: z.string().min(1), containerId: z.string().optional(),
});
export type ArtifactSource = z.infer<typeof artifactSourceSchema>;
export const artifactReferenceSchema = z.object({
  assetId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), source: artifactSourceSchema,
  fileName: z.string(), mimeType: z.string(), previewText: z.string().optional(),
});
export type ArtifactReference = z.infer<typeof artifactReferenceSchema>;


export type ArtifactAttach = (reference: ArtifactReference) => () => boolean;
