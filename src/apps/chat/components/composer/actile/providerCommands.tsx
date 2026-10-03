import { skillOriginForModel } from '~/common/personal/skills';
import { localJSON } from '~/common/personal/disk-storage';
import { findAllChatCommands } from '../../../commands/commands.registry';
import type { ActileItem, ActileProvider, ActileProviderItems } from './ActileProvider';

type CatalogSkill = { id: string; origin: string; name: string; description: string; unsupported: string[] };
export const providerCommands = (onCommandSelect: (item: ActileItem, searchPrefix: string) => void, model: string): ActileProvider => ({
  key: 'pcmd',
  get label() { return 'Commands and local skills'; },
  fastCheckTriggerText: trailingText => trailingText === '/',
  fetchItems: async (): ActileProviderItems => {
    const origin = skillOriginForModel(model);
    const { skills } = origin ? await localJSON(`skills?origin=${origin}`) : { skills: [] };
    return { searchPrefix: '/', items: [
      ...skills.map((skill: CatalogSkill) => ({ key: `skill:${skill.id}`, providerKey: 'pcmd' as const,
        label: `/${skill.name}:${skill.origin}`, description: skill.description + (skill.unsupported.length ? ' - instruction-only, tools unavailable' : '') })),
      ...findAllChatCommands().map(cmd => ({ key: cmd.primary, providerKey: 'pcmd', label: cmd.primary,
        argument: cmd.arguments?.join(' '), description: cmd.description, Icon: cmd.Icon } satisfies ActileItem)),
    ] };
  },
  onItemSelect: item => onCommandSelect(item, '/'),
});
