import { create } from 'zustand';

// Transient ownership survives Stop clearing the conversation's abort controller.
export const useChatRuns = create<{ active: Record<string, symbol> }>(() => ({ active: {} }));
export function hasChatRun(conversationId: string) { return !!useChatRuns.getState().active[conversationId]; }

export function acquireChatRun(conversationId: string) {
  if (hasChatRun(conversationId)) throw new Error('Wait for the running chat and local tools to finish before sending again.');
  const token = Symbol(conversationId);
  useChatRuns.setState(state => ({ active: { ...state.active, [conversationId]: token } }));
  const isCurrent = () => useChatRuns.getState().active[conversationId] === token;
  return {
    isCurrent,
    release() {
      if (!isCurrent()) return;
      useChatRuns.setState(state => {
        const active = { ...state.active };
        delete active[conversationId];
        return { active };
      });
    },
  };
}
