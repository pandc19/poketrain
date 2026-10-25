import { EVERSTONE } from '../breeding/items';
import type { Localized } from '../translate';

/**
 * An evolution that only one form of the base species can make, so the parent has to be that form. Which
 * species and forms do this, and what keeps an egg the form, depends on the game: each game lists its own
 * (see GameConfig.breedingForms), and the breeding plan reads them through the engine's FormLock.
 */
export type BreedingFormRule = {
  /** The evolved species the plan is for. */
  targetId: number;
  /** The species that hatches. */
  baseId: number;
  /** The form the parent must be (the slug in the forms table). */
  formSlug: string;
  /** The form as the player reads it. */
  name: Localized;
  /** What the parent holds so the egg keeps the form, if anything. */
  item: { name: Localized; slug: string } | null;
};

export const SCARLET_VIOLET_BREEDING_FORMS: BreedingFormRule[] = [
  {
    // Only the White-Striped Basculin of Hisui evolves into Basculegion, and its egg is one only if the parent holds an Everstone.
    targetId: 902,
    baseId: 550,
    formSlug: 'basculin-white-striped',
    name: { en: 'White-Striped Basculin', es: 'Basculin de raya blanca' },
    item: EVERSTONE,
  },
];
