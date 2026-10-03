import type { estimateTokensForFragments } from '~/common/stores/chat/chat.tokens';

/** Weak ownership keeps removed history collectible. Check text too, including in-place edits. */
export function createPreviewFragmentCounter(count: typeof estimateTokensForFragments, countingMethod: 'accurate' | 'approximate' = 'accurate'): typeof estimateTokensForFragments {
  const cache = new WeakMap<object, { text: string; ref?: string; role: string; ft: string; tokens: number }>();
  // Newly assembled system/skill/delimiter fragments need a bounded content cache too.
  const generated = new Map<string, number>();
  let cachedCharacters = 0;
  return (llm, role, fragments, addTopGlue, debugFrom) => {
    // Request assembly always uses top glue, so each fragment is additive.
    if (!addTopGlue) return count(llm, role, fragments, addTopGlue, debugFrom);
    return fragments.reduce((total, fragment) => {
      if (!('part' in fragment)) return total + count(llm, role, [fragment], true, debugFrom);
      const part = fragment.part;
      const text = part.pt === 'text' ? part.text : part.pt === 'doc' ? part.data.text : undefined;
      if (text === undefined) return total + count(llm, role, [fragment], true, debugFrom);
      const ref = part.pt === 'doc' ? part.ref : undefined;
      const previous = cache.get(part);
      if (previous && previous.text === text && previous.ref === ref && previous.role === role && previous.ft === fragment.ft) return total + previous.tokens;
      const key = JSON.stringify([countingMethod, role, fragment.ft, ref, text]);
      const tokens = generated.get(key) ?? count(llm, role, [fragment], true, debugFrom);
      if (!generated.has(key) && key.length <= 2_000_000) {
        generated.set(key, tokens); cachedCharacters += key.length;
        while (generated.size > 32 || cachedCharacters > 2_000_000) {
          const oldest = generated.keys().next().value;
          if (oldest === undefined) break;
          generated.delete(oldest); cachedCharacters -= oldest.length;
        }
      }
      cache.set(part, { text, ref, role, ft: fragment.ft, tokens });
      return total + tokens;
    }, 0);
  };
}
