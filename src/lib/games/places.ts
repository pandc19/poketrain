import type { Localized } from '../translate';

/**
 * The places of Scarlet and Violet (Paldea, Kitakami and Blueberry) as the English and the Spanish games call them.
 * The Spanish names are not translations: Asado Desert is Desierto Rostiz, and Mesagoza is Ciudad Meseta. PokéAPI
 * has these places but not their Spanish names, so they were taken from WikiDex and only the ones that could be
 * matched with their English name are here. A place that is missing is shown as the model wrote it.
 *
 * The AI answers are written once in both languages. Its Spanish text is then run through these names (see
 * localizeNames), so a place the model left in English reads right to a Spanish player, at no cost in tokens.
 */
const place = (en: string, es: string): Localized => ({ en, es });

const AREAS: [string, string][] = [
  ['North', 'norte'],
  ['South', 'sur'],
  ['East', 'este'],
  ['West', 'oeste'],
];
const NUMBERS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];

export const SCARLET_VIOLET_PLACES: Localized[] = [
  // The regions and the two expansions.
  place('Kitakami', 'Noroteo'),
  place('Blueberry', 'Arándano'),
  place('Blueberry Academy', 'Academia Arándano'),
  place('The Teal Mask', 'La Máscara Turquesa'),
  place('The Indigo Disk', 'El Disco Índigo'),

  // Paldea: the towns and cities.
  place('Cabo Poco', 'Pueblo Cahíz'),
  place('Los Platos', 'Pueblo Ataifor'),
  place('Mesagoza', 'Ciudad Meseta'),
  place('Cortondo', 'Pueblo Pirotín'),
  place('Alfornada', 'Pueblo Alforno'),
  place('Artazon', 'Pueblo Altamía'),
  place('Levincia', 'Ciudad Leudal'),
  place('Zapapico', 'Pueblo Veta'),
  place('Cascarrafa', 'Ciudad Cántara'),
  place('Porto Marinada', 'Pueblo Marinada'),
  place('Medali', 'Pueblo Mestura'),
  place('Montenevera', 'Pueblo Hozkailu'),

  // Paldea: the numbered areas ("South Province (Area One)" is "Área 1 del sur") and the seas.
  ...AREAS.flatMap(([en, es]) =>
    NUMBERS.slice(0, en === 'South' ? 6 : 3).map((n, i) => place(`${en} Province (Area ${n})`, `Área ${i + 1} del ${es}`))
  ),
  place('North Paldean Sea', 'Mar Septentrional de Paldea'),
  place('South Paldean Sea', 'Mar Meridional de Paldea'),
  place('East Paldean Sea', 'Mar Oriental de Paldea'),
  place('West Paldean Sea', 'Mar Occidental de Paldea'),

  // Paldea: the wild places, the shrines, the Team Star bases and the rest.
  place('Poco Path', 'Sendero de Cahíz'),
  place('Inlet Grotto', 'Gruta Caleta'),
  place('Alfornada Cavern', 'Sima de Alforno'),
  place('Asado Desert', 'Desierto Rostiz'),
  place('Glaseado Mountain', 'Sierra Napada'),
  place('Casseroya Lake', 'Lago Cazola'),
  place('Socarrat Trail', 'Alameda Socarrada'),
  place('Grasswither Shrine', 'Santuario Mustiarbor'),
  place('Icerend Shrine', 'Santuario Glaceratio'),
  place('Groundblight Shrine', 'Santuario Detriterra'),
  place('Firescourge Shrine', 'Santuario Devastigneus'),
  place("Segin Squad's Base", 'Base del Escuadrón Segin'),
  place("Schedar Squad's Base", 'Base del Escuadrón Schedar'),
  place("Navi Squad's Base", 'Base del Escuadrón Tsih'),
  place("Ruchbah Squad's Base", 'Base del Escuadrón Ruchbah'),
  place("Caph Squad's Base", 'Base del Escuadrón Caph'),
  place('Area Zero', 'Área Cero'),
  place('Zero Lab', 'Laboratorio Cero'),
  place('Pokémon League', 'Liga Pokémon'),
  place('Naranja Academy', 'Academia Naranja'),
  place('Uva Academy', 'Academia Uva'),

  // Kitakami.
  place('Mossui Town', 'Villa Versui'),
  place('Oni Mountain', 'Monte Ogro'),
  place("Oni's Maw", 'Fauces del Ogro'),
  place('Chilling Waterhead', 'Cueva Aguafría'),
  place('Apple Hills', 'Colina Manzanar'),
  place('Wistful Fields', 'Pradera Glicina'),
  place('Paradise Barrens', 'Elíseo Baldío'),
  place('Kitakami Wilds', 'Campos Prístinos de Noroteo'),
  place('Kitakami Road', 'Carretera de Noroteo'),
  place('Timeless Woods', 'Soto Sempiterno'),
  place('Fellhorn Gorge', 'Desfiladero del Cuerno'),
  place('Mossfell Confluence', 'Ribera Confluencia'),
  place("Reveler's Road", 'Senda Jarana'),
  place('Infernal Pass', 'Paso del Averno'),
  place('Crystal Pool', 'Lago Cristalino'),

  // Blueberry Academy.
  place('Canyon Biome', 'Área Escarpada'),
  place('Canyon Plaza', 'Plaza Escarpada'),
  place('Savanna Biome', 'Área Árida'),
  place('Savanna Plaza', 'Plaza Árida'),
  place('Polar Biome', 'Área Polar'),
  place('Polar Plaza', 'Plaza Polar'),
  place('Coastal Biome', 'Área Costera'),
  place('Coastal Plaza', 'Plaza Costera'),
  place('Chargestone Cavern', 'Caverna Electrorroca'),
  place('Torchlit Labyrinth', 'Laberinto Lumbre'),
  place('League Club Room', 'Sala del Club de la Liga'),
];
