import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActileQuery, actileLabelQuery, actileSelectionKey } from './ActileQuery';
import { extractChatCommand } from '../../../commands/commands.registry';

test('literal slash task stays literal for both pending and ready sole catalog result', () => {
  for (const pending of [true, false]) {
    const query = new ActileQuery(); const generation = query.begin('/'); query.update('/fr');
    if (!pending) query.settle();
    assert.equal(actileSelectionKey(' ', query.query, 1), false);
    query.close();
    assert.equal(query.isCurrent(generation), false);
    assert.deepEqual(extractChatCommand('/fr hello'), [{ type: 'nocmd', value: '/fr hello' }]);
  }
  for (const key of ['Enter', 'ArrowRight', 'Tab']) assert.equal(actileSelectionKey(key, '/fr', 1), true);
});

test('at catalogs match labels after the trigger, including after ordinary draft text and delayed typing', () => {
  const query = new ActileQuery(); query.begin('Review these @');
  query.update('Review these @Re'); query.settle();
  const labels = ['Report.pdf', 'Research - starred...', 'Other.pdf'];
  assert.deepEqual(labels.filter(label => label.toLowerCase().startsWith(actileLabelQuery(query.query, ''))), ['Report.pdf', 'Research - starred...']);
  assert.equal(query.query, '@Re');
  assert.equal(actileLabelQuery('@', ''), '');
  assert.equal(actileLabelQuery('/Fr', '/'), '/fr');
});
