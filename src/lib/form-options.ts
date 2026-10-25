import { variantOfSlug } from './dex-variant';

/**
 * Whether a form is one a Pokémon in the player's box can be told apart by (White-Striped Basculin, Aqua Breed
 * Tauros). Regional forms are left out, as the Pokédex keeps them as entries of their own, and so are forms that
 * only exist in battle or for one event (Mega, Gigantamax, Totem, the starter Pikachu and Eevee, caps).
 */
export const isBoxForm = (slug: string) => variantOfSlug(slug) === '' && !/-(mega|primal|gmax|eternamax|totem|starter|cap)(-|$)/.test(slug);

const titleCase = (slug: string) => slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** A form's name for the player: "White Striped" for basculin-white-striped, "Normal" for the species' own. */
export const formLabel = (speciesSlug: string, formSlug: string) =>
  formSlug === speciesSlug ? 'Normal' : titleCase(formSlug.startsWith(`${speciesSlug}-`) ? formSlug.slice(speciesSlug.length + 1) : formSlug);
