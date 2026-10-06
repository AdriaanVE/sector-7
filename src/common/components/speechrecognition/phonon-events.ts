import type { SpeechResult } from './useSpeechRecognition';

export type PhononEvent =
  | { type: 'partial'; text: string }
  | { type: 'final'; text: string; segment: number }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string };

/** Partials are full hypotheses. Only finalized segments accumulate. */
export function applyPhononEvent(result: SpeechResult, event: PhononEvent): SpeechResult {
  if (result.done) return result;
  switch (event.type) {
    case 'partial': return { ...result, interimTranscript: event.text };
    case 'final': return { ...result, transcript: [result.transcript.trim(), event.text.trim()].filter(Boolean).join(' ') + ' ', interimTranscript: '' };
    case 'done': return { ...result, transcript: event.text, interimTranscript: '', done: true };
    case 'error': return { ...result, interimTranscript: '', done: true, doneReason: 'api-error', flagSendOnDone: false };
  }
}

export function parsePhononEvent(data: string): PhononEvent {
  const event: unknown = JSON.parse(data);
  if (event && typeof event === 'object' && 'type' in event) {
    if (event.type === 'error' && 'message' in event && typeof event.message === 'string') return { type: 'error', message: event.message };
    if ('text' in event && typeof event.text === 'string') {
      if (event.type === 'partial' || event.type === 'done') return { type: event.type, text: event.text };
      if (event.type === 'final' && 'segment' in event && typeof event.segment === 'number') return { type: 'final', text: event.text, segment: event.segment };
    }
  }
  throw new Error('Phonon returned an invalid stream event.');
}
