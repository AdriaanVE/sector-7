import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { diskStorage } from './disk-storage';
interface PersonalSettings { instructions: string; setInstructions: (instructions: string) => void }
export const usePersonalSettings = create<PersonalSettings>()(persist(set => ({ instructions: '', setInstructions: instructions => set({ instructions }) }), {
  name: 'app-personal-settings', version: 1, skipHydration: true, storage: diskStorage<PersonalSettings>(), partialize: state => ({ instructions: state.instructions }) as PersonalSettings,
}));
