/** A pending catalog retains typing and cannot reopen a cancelled popup. */
export class ActileQuery {
  query = '';
  private generation = 0;
  private loading = false;
  private triggerStart = 0;
  begin(query: string) { this.triggerStart = query.endsWith('@') ? query.length - 1 : 0; this.update(query); this.loading = true; return ++this.generation; }
  update(query: string) { this.query = query.slice(this.triggerStart); }
  isCurrent(generation: number) { return generation === this.generation; }
  get pending() { return this.loading; }
  settle() { this.loading = false; }
  close() { this.generation++; this.loading = false; this.query = ''; }
}

/** Providers display either the trigger itself (slash) or only the label (at). */
export function actileLabelQuery(query: string, searchPrefix: string) {
  return (searchPrefix + query.slice(1)).toLowerCase();
}

export function actileSelectionKey(key: string, query: string, totalItems: number) {
  return key === 'Enter' || key === 'ArrowRight' || key === 'Tab' || (key === ' ' && totalItems === 1 && !query.startsWith('/'));
}
