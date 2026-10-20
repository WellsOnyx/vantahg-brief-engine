import { IdrContentError } from './schema';

export function fillPhrase(template: string, vars: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{([a-z0-9_]+)\}\}/g, (full, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      throw new IdrContentError(`Content phrase is missing a value for {{${key}}}.`);
    }
    return vars[key];
  });
}

export function partyName(party: 'IP' | 'NIP'): string {
  return party === 'IP' ? 'initiating party' : 'non-initiating party';
}
