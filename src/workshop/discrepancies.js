// Open questions and conflicts that already exist between Kayden's sources. Every line here is quoted or summarised
// from a file in the source catalog (cited by source id + section); nothing is decided or invented.
// Used by the workshop's "Open questions in the sources" panel and by the exported brief.

export const DISCREPANCIES = [
  {
    id: 'planet-size',
    title: 'Planet size: small world (A) or Earth-sized (B)',
    summary: 'If Lake Veir is Bonneville-sized (about 51,000 km²) on an Earth-sized planet, the land only reaches from the equator to about 19°N, too far south for the taiga, snow and Ice Sea. One ruler has to give.',
    options: [
      'A. Small world: radius 1,693 km, 0.27 g, Lake Veir stays 51,000 km², the cluster is about 2,950 km west to east.',
      'B. Earth-sized: radius 6,371 km, 1.00 g, the map scales up about 3.76×, Lake Veir becomes about 722,000 km² and the cluster about 11,100 km.'
    ],
    inWorld: 'Both are kept: the 3D view has a planet-size toggle. Coastlines, latitudes and heights are the same in each.',
    cites: [{ source: 'spec', section: 'The planet' }, { source: 'drive_doc', section: 'Planet, Scale, and Sky' }],
    places: ['orbit', 'veir']
  },
  {
    id: 'lake-revision',
    title: 'Lake sizes: September penup lakes vs the Oct 10 outline',
    summary: 'The 3D terrain is built from the blue lake loops of the September penup outline. kiros_earth_re.png (Drive, modified Oct 10) draws substantially smaller lakes, and its Dire Lake has no inner depression loop. The Oct 10 Google Doc still calls Lake Veir about Bonneville-sized and the ruler for every distance.',
    options: [
      'Keep the penup lakes (current terrain, matches the doc\'s Bonneville ruler).',
      'Adopt the Oct 10 lakes (newest drawing; then the ruler and option A/B numbers need restating).'
    ],
    inWorld: 'The terrain still shows the September lakes. Compare both in the Compare tab; the Oct 10 ink can be draped on the globe.',
    cites: [
      { source: 'earth_re', section: 'the drawing itself' },
      { source: 'penup', section: 'blue ink lake loops' },
      { source: 'drive_doc', section: 'Major Lakes' },
      { source: 'painted_revised_oct10', section: 'caption "Smaller inland lakes … lake areas not yet calibrated"' }
    ],
    places: ['veir', 'sfere', 'dire']
  },
  {
    id: 'malos-tip',
    title: 'Malos south tip at about 2°S',
    summary: 'The cluster is said to lie wholly in the northern hemisphere, with Fiira\'s south tip touching the equator, but on the current outline the south tip of Malos falls about 2° south of the equator.',
    options: ['Keep it (a sliver of land in the south).', 'Shift everything about 2° north.'],
    inWorld: 'The build keeps the spec placement, so Malos dips just below the equator.',
    cites: [{ source: 'spec', section: 'Placement on the globe' }, { source: 'drive_doc', section: 'Planet, Scale, and Sky (working latitudes)' }],
    places: ['dire', 'malos-wet']
  },
  {
    id: 'northern-limit',
    title: 'Northern limit: 68°N as built vs 75°N in the text',
    summary: 'The spec and the doc put the northernmost islands at about 75°N ("not quite into the poles"). With the spec\'s own placement (center 37.2°N, 0.076° per outline pixel) the top island lands at 68°N. Fiira\'s tip on the equator and the top island at 75°N cannot both hold; the best compromise found puts the center at 43°N and the tip at 0.8°N.',
    options: ['Accept about 68°N.', 'Stretch to 75°N (moves the center north and lifts Fiira\'s tip off the equator).'],
    inWorld: 'The build keeps the spec placement (about 68°N).',
    cites: [{ source: 'acceptance', section: 'Findings for Kayden: Northern limit' }, { source: 'spec', section: 'Placement on the globe' }, { source: 'drive_doc', section: 'Planet, Scale, and Sky' }],
    places: ['north']
  },
  {
    id: 'painted-drift',
    title: 'AI-painted maps drift from the outline',
    summary: 'The painted map shows Ender and northwest Fiira as desert, moves the three lakes, drops Dire Lake\'s inner depression, adds a snowy range across north Roan, darkens the inner seas and adds rivers. It is art direction only.',
    options: [],
    inWorld: 'Geometry and biomes come from the penup outline and kiros_v5, not the painted maps.',
    cites: [{ source: 'spec', section: 'Where the painted map drifts from canon' }, { source: 'drive_doc', section: 'Current Map Scope' }],
    places: ['ender']
  },
  {
    id: 'map-a-frame',
    title: 'Kiros_Map_A uses a different frame',
    summary: 'The historical pencil map is rotated relative to the current north-up outline. Its coordinates must not be mixed with the master grid.',
    options: [],
    inWorld: 'Shown only as a visual comparison, never registered to the globe.',
    cites: [{ source: 'map_a', section: 'the drawing itself' }],
    places: []
  }
];

// Open questions Kayden's own documents already list. Each is phrased as a prompt and keeps its citation.
export const SOURCE_PROMPTS = [
  { q: 'Is Kiros the small world (A, radius 1,693 km, 0.27 g) or Earth-sized (B, 6,371 km, 1 g)? Which of Lake Veir\'s Bonneville size and the 0–75°N latitude span gives way?', source: 'SPEC.md, Open questions; Drive description, Planet, Scale, and Sky' },
  { q: 'Malos\'s south tip sits about 2° south of the equator, yet nothing should lie in the southern hemisphere. Keep it, or shift everything 2° north?', source: 'SPEC.md, Placement on the globe' },
  { q: 'The text puts the northernmost islands at about 75°N, but the spec\'s own placement lands them at 68°N. Which number is right for "not quite into the poles"?', source: 'SPEC.md, Open questions; acceptance.md, Findings for Kayden' },
  { q: 'Are the inner seas salt water or fresh? Older lore said the gods turned them fresh; the settled fact is only that they are protected.', source: 'SPEC.md, Water; Drive description, Continental History and Water' },
  { q: 'Does Lake Veir drain out through a pass like Bonneville\'s Red Rock Pass (fresh, with old shorelines), or is it a closed salt lake?', source: 'SPEC.md, Water, rules for the builder' },
  { q: 'The two moons are about half and a third of Earth\'s Moon. What are their distances, colors and orbits? The sentence about them was cut off.', source: 'SPEC.md, Moons; Drive description, Planet, Scale, and Sky' },
  { q: 'Is the Dragon Islands volcano active or dormant?', source: 'SPEC.md, Open questions' },
  { q: 'Keep Earth\'s 24-hour day and 23° axial tilt?', source: 'SPEC.md, Open questions' },
  { q: 'Are the proposed heights right: 2,600 m northwest Fiira, 3,600 m Roan, 3,300 m Dragon volcano, 1,800–2,400 m northern islands?', source: 'SPEC.md, Landmasses and elevation; Open questions' },
  { q: 'Earlier notes describe Wurth drifting toward a black hole. Is anything of it visible in Kiros\'s sky?', source: 'SPEC.md, Open questions' },
  { q: 'Rongle (or Roglie) is a place within the western land but not the continent. What is its modern scope?', source: 'Drive description, Fiira' },
  { q: 'Where exactly are the boundaries of the Icaia/Icala Islands and the Jerr Islands in the northern belt?', source: 'Drive description, Northern Islands' },
  { q: 'Are the Goblin, Nuclan and Malos Mountains of the older maps subdivisions of today\'s larger systems, and which?', source: 'Drive description, Mountain Systems' },
  { q: 'Which older names (Core, Capet, Terra, Fama, Hima, Ignas, Galem, Bose/Boge, Diron, Oreis/Oasis, Amel, Forner/Farner, Roglie, Drognor) still belong on the current outline, and where?', source: 'Drive description, Other Names Preserved by Older Maps' },
  { q: 'The Oct 10 outline draws Dire Lake as one small loop. Does the inner depression (basin center below sea level) still exist?', source: 'kiros_earth_re.png vs Drive description, Malos and Major Lakes' },
  { q: 'kiros_earth_re.png draws fewer mountain strokes than the penup outline, and the Oct 10 painted concept is captioned "Revised mountain placement". Are the September mountain marks still current?', source: 'kiros_earth_re.png; ChatGPT Image Oct 10 caption; SPEC.md, Landmasses and elevation' }
];
