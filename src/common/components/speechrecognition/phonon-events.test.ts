import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPhononEvent } from './phonon-events';
import type { SpeechResult } from './useSpeechRecognition';

const initial: SpeechResult = { transcript: '', interimTranscript: '', done: false, doneReason: undefined, flagSendOnDone: undefined };

test('Phonon partial replaces the current phrase while final segments stay in place', () => {
  let result = applyPhononEvent(initial, { type: 'partial', text: 'refactor' });
  result = applyPhononEvent(result, { type: 'partial', text: 'refactor the settings' });
  assert.equal(result.interimTranscript, 'refactor the settings');
  result = applyPhononEvent(result, { type: 'final', text: 'Refactor the settings.', segment: 1 });
  result = applyPhononEvent(result, { type: 'partial', text: 'load the' });
  assert.equal(result.transcript, 'Refactor the settings. ');
  result = applyPhononEvent(result, { type: 'final', text: 'Load the status.', segment: 2 });
  assert.equal(result.transcript, 'Refactor the settings. Load the status. ');
  assert.equal(result.interimTranscript, '');
});

test('done is authoritative, keeps the stop reason, and ignores later events', () => {
  const stopped = { ...initial, transcript: 'Earlier. ', interimTranscript: 'in progress', doneReason: 'continuous-deadline' as const, flagSendOnDone: true };
  const result = applyPhononEvent(stopped, { type: 'done', text: 'Earlier. Corrected phrase.' });
  assert.deepEqual(result, { ...stopped, transcript: 'Earlier. Corrected phrase.', interimTranscript: '', done: true });
  assert.equal(applyPhononEvent(result, { type: 'partial', text: 'late' }), result);
});

test('error preserves finished text, discards the hypothesis and disables send-on-done', () => {
  const result = applyPhononEvent({ ...initial, transcript: 'Keep this. ', interimTranscript: 'unfinished', flagSendOnDone: true }, { type: 'error', message: 'crashed' });
  assert.equal(result.transcript, 'Keep this. ');
  assert.equal(result.interimTranscript, '');
  assert.equal(result.done, true);
  assert.equal(result.doneReason, 'api-error');
  assert.equal(result.flagSendOnDone, false);
});
