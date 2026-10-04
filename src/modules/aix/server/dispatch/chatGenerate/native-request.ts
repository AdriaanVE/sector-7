import type { AixAPI_Model, AixAPIChatGenerate_Request } from '../../api/aix.wiretypes';

/** Cache placement and thinking display policy do not change the signed conversation prefix. */
export async function nativeRequestPrefix(model: AixAPI_Model, request: AixAPIChatGenerate_Request, end: number): Promise<string> {
  const parts = (message: { parts: { pt: string }[] }) => message.parts.filter(part => part.pt !== 'ma' && part.pt !== 'meta_cache_control');
  const value = JSON.stringify({ model: model.id, system: request.systemMessage ? parts(request.systemMessage) : null,
    tools: request.tools ?? [], toolsPolicy: request.toolsPolicy ?? null,
    hosted: [model.vndAntWebSearch, model.vndAntWebFetch],
    messages: request.chatSequence.slice(0, end).map(message => ({ role: message.role, parts: parts(message),
      ...(message.role === 'model' && message.nativeHistory ? { nativeContent: message.nativeHistory.segments } : {}),
    })),
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** The deployment lacks binding controls, so only unchanged, proven prefixes may reuse signatures. */
export async function prepareNativeRequest(model: AixAPI_Model, request: AixAPIChatGenerate_Request, deployment: string): Promise<AixAPIChatGenerate_Request> {
  const safe = structuredClone(request);
  for (const [index, message] of safe.chatSequence.entries()) {
    if (message.role !== 'model') continue;
    const history = message.nativeHistory;
    if (history?.deployment === deployment && history.model === model.id) {
      const content = history.segments.flatMap(segment => segment.content);
      const results = new Set(content.flatMap(block => block.type.endsWith('_tool_result') && typeof block.tool_use_id === 'string' ? [block.tool_use_id] : []));
      const incomplete = content.find(block => block.type === 'server_tool_use' && typeof block.id === 'string' && !results.has(block.id));
      if (incomplete) throw new Error('A saved native tool call has no result. Retry that search turn or branch before it to continue. The original history was preserved.');
    }
    const valid = history?.deployment === deployment && history.model === model.id && !!history.requestPrefix
      && history.requestPrefix === await nativeRequestPrefix(model, request, index);
    if (valid) continue;
    message.parts = message.parts.filter(part => part.pt !== 'ma');
    if (history) history.segments = history.segments.map(segment => ({ ...segment,
      content: segment.content.filter(block => block.type !== 'thinking' && block.type !== 'redacted_thinking'),
    }));
  }
  return safe;
}
