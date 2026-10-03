/** Scope delayed skill loads to the current chat and latest selection of each skill. */
export class SkillSelectionScope {
  private chat: string | null = null;
  private model = '';
  setModel(model: string) { if (model !== this.model) { this.model = model; this.versions.clear(); } }
  private versions = new Map<string, object>();
  setChat(chat: string | null) {
    if (chat !== this.chat) { this.chat = chat; this.versions.clear(); }
  }
  begin(id: string): () => boolean {
    const version = {}; this.versions.set(id, version);
    return () => this.versions.get(id) === version;
  }
  remove(id: string) { this.versions.delete(id); }
  clear() { this.versions.clear(); }
}
