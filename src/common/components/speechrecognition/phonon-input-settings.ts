import { z } from 'zod';

export const phononInputSettingsSchema = z.object({
  noiseFloor: z.number().min(0).max(0.1),
  leadInMs: z.number().int().min(0).max(300),
  tailMs: z.number().int().min(0).max(1000),
  autoGainControl: z.boolean(),
});
export type PhononInputSettings = z.infer<typeof phononInputSettingsSchema>;

export const defaultPhononInputSettings: PhononInputSettings = {
  noiseFloor: 0.015,
  leadInMs: 100,
  tailMs: 600,
  autoGainControl: false,
};
