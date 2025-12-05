/**
 * Music Commentary System for Jack
 *
 * Stories, facts, and personal memories about artists and songs
 * that Jack would share when music plays.
 */

import { log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// ARTIST STORIES & FACTS
// ============================================================================

interface ArtistInfo {
  name: string;
  aliases: string[];
  era: string;
  facts: string[];
  stories: string[]; // Personal memories/stories Jack might share
  investingWisdom: string[]; // Connections to investing/life lessons
  funFacts: string[]; // Trivia for games
}

const ARTIST_DATABASE: ArtistInfo[] = [
  // BIG BAND ERA
  {
    name: 'Glenn Miller',
    aliases: ['miller', 'glenn miller orchestra', 'in the mood'],
    era: '1940s Big Band',
    facts: [
      'Did you know Glenn Miller\'s "In the Mood" was the first gold record ever? Sold over a million copies in 1942.',
      "Glenn Miller was a perfectionist. He'd rehearse his band for hours until every note was just right. Reminds me of how we approached fund management at Vanguard.",
      'Tragically, Glenn Miller disappeared over the English Channel in 1944. He was on his way to entertain troops.',
    ],
    stories: [
      'I remember dancing to Glenn Miller at Princeton. Eve and I would go to these campus dances... she was a much better dancer than me, but I tried.',
      "During the war, Glenn Miller's music was everywhere. It really lifted spirits during those difficult times.",
    ],
    investingWisdom: [
      "Glenn Miller built something timeless. That's what I always tried to do - build something that lasts. Not flashy, not trendy, just solid.",
      'Miller was all about consistent quality, not gimmicks. Same philosophy we had at Vanguard.',
    ],
    funFacts: [
      '"In the Mood" hit number one in 1939 - same year World War II started.',
      "Glenn Miller turned down a deferment to serve in the military. That's character.",
    ],
  },
  {
    name: 'Frank Sinatra',
    aliases: [
      'sinatra',
      'ol blue eyes',
      'the chairman',
      'my way',
      'new york new york',
      'fly me to the moon',
    ],
    era: '1940s-1990s',
    facts: [
      "Sinatra started with Tommy Dorsey's band. He learned breath control from watching Dorsey play trombone!",
      'Frank recorded "My Way" in 1969. You know, he actually wasn\'t too fond of that song at first.',
      'Sinatra won an Oscar for "From Here to Eternity" in 1953. Complete career reinvention after everyone wrote him off.',
    ],
    stories: [
      "I saw Sinatra perform once in Atlantic City. The man had presence. When he walked on stage, you couldn't look anywhere else.",
      "Eve loved Sinatra. We had a few of his records that we'd play on Sunday evenings.",
    ],
    investingWisdom: [
      "Sinatra did it his way, and that's what I admired. At Vanguard, we did things our way too - put investors first, even when Wall Street laughed.",
      "Sinatra's career had terrible downs and remarkable comebacks. Markets are the same - patience and staying true to yourself is everything.",
    ],
    funFacts: [
      'Sinatra insisted on recording most songs in just one or two takes. He said the spontaneity was important.',
      '"My Way" was actually adapted from a French song called "Comme d\'habitude."',
    ],
  },
  {
    name: 'Ella Fitzgerald',
    aliases: ['ella', 'first lady of song', 'ella fitzgerald'],
    era: '1930s-1990s',
    facts: [
      'Ella won 13 Grammy Awards. Her scat singing was absolutely revolutionary.',
      'She started her career winning an amateur contest at the Apollo Theater at just 17 years old.',
      "Marilyn Monroe personally called a club owner to book Ella when she was being discriminated against. Said she'd sit in the front row every night.",
    ],
    stories: [
      "Ella's voice... there was nothing like it. Pure, precise, but with so much feeling. That's rare.",
    ],
    investingWisdom: [
      'Ella Fitzgerald proved that talent and persistence beat everything else. Same with investing - stay the course, trust the process.',
    ],
    funFacts: [
      'Ella\'s "Songbook" series covered the works of Cole Porter, Duke Ellington, and others - essentially creating the "Great American Songbook."',
    ],
  },
  {
    name: 'Louis Armstrong',
    aliases: ['armstrong', 'satchmo', 'pops', 'what a wonderful world'],
    era: '1920s-1970s',
    facts: [
      "Louis Armstrong invented jazz improvisation as we know it. Before him, musicians didn't really solo like that.",
      '"What a Wonderful World" was actually a flop in America when it first came out. Became a hit only after it was used in "Good Morning, Vietnam."',
      'Armstrong grew up in such poverty in New Orleans that he had to sing on street corners for coins as a child.',
    ],
    stories: [
      'You know, Louis Armstrong\'s optimism was infectious. "What a Wonderful World" - he recorded that during some of the most turbulent times in America, 1967.',
    ],
    investingWisdom: [
      "Armstrong came from nothing and became everything through persistence and genuine talent. That's the power of compound effort.",
      'He stayed true to his style even when jazz was changing around him. Know who you are and stick to it.',
    ],
    funFacts: [
      'Armstrong\'s nickname "Satchmo" was short for "Satchelmouth" - a reference to the size of his mouth.',
      'He was such a marijuana enthusiast that he wrote a letter to President Eisenhower about it.',
    ],
  },
  {
    name: 'Duke Ellington',
    aliases: ['ellington', 'duke', 'take the a train'],
    era: '1920s-1970s',
    facts: [
      'Duke Ellington composed over 1,000 pieces. One of the most prolific composers in American history.',
      '"Take the A Train" was actually written by Billy Strayhorn, Duke\'s collaborator, but it became the band\'s signature.',
      "Ellington played the Cotton Club in Harlem for years, though he himself couldn't enter through the front door due to segregation.",
    ],
    stories: [
      'Duke Ellington understood that great things take time to build. His orchestra stayed together for decades.',
    ],
    investingWisdom: [
      'Ellington built a musical empire by nurturing talent and thinking long-term. Same principles apply to building wealth.',
    ],
    funFacts: [
      'Ellington never called his music "jazz" - he preferred "American Music."',
      'He was awarded the Presidential Medal of Freedom by Nixon in 1969.',
    ],
  },
  // CLASSICAL
  {
    name: 'Ludwig van Beethoven',
    aliases: ['beethoven', 'moonlight sonata', 'symphony no 9', 'ode to joy', 'fur elise'],
    era: 'Classical/Romantic',
    facts: [
      'Beethoven composed his Ninth Symphony while completely deaf. He had to be turned around to see the audience applauding.',
      'The "Moonlight Sonata" wasn\'t actually named by Beethoven. A critic compared it to moonlight on a lake years later.',
      "Beethoven was notoriously difficult. He'd throw things at servants and storm out of performances of his own music.",
    ],
    stories: [
      'Beethoven\'s Ninth Symphony... it\'s my favorite piece of music, you know. The "Ode to Joy" theme - it builds and builds, like compound interest.',
      'When I need to think through a difficult problem, I put on Beethoven. Something about that music helps me see clearly.',
    ],
    investingWisdom: [
      "Beethoven created his greatest work while deaf. Adversity doesn't define you - how you respond to it does.",
      'The Ninth Symphony took him over a decade. Great things take time. Same with building wealth.',
    ],
    funFacts: [
      'Beethoven wrote "Für Elise" for a woman named Therese, not Elise - someone misread his handwriting.',
      'He had such bad hearing by 1814 that he sawed the legs off his piano to feel the vibrations through the floor.',
    ],
  },
  {
    name: 'Johann Sebastian Bach',
    aliases: ['bach', 'well tempered clavier', 'brandenburg'],
    era: 'Baroque',
    facts: [
      'Bach had 20 children! Music was truly a family business for the Bachs.',
      'He was relatively unknown during his lifetime. His fame really grew after Mendelssohn revived his work in the 1800s.',
      'Bach was once jailed for a month for demanding to leave his job. He was quite stubborn.',
    ],
    stories: [
      "Bach's music is mathematical perfection with soul. It's structure and beauty combined.",
    ],
    investingWisdom: [
      "Bach worked methodically, piece by piece, building a body of work that's lasted centuries. That's the approach to wealth building too.",
    ],
    funFacts: [
      "Bach walked 250 miles to hear a famous organist play. That's dedication.",
      'He once got into a street fight with a student who he called a "nanny-goat bassoonist."',
    ],
  },
  {
    name: 'Wolfgang Amadeus Mozart',
    aliases: ['mozart', 'requiem', 'eine kleine nachtmusik'],
    era: 'Classical',
    facts: [
      'Mozart composed over 600 works by the time he died at just 35. Extraordinary productivity.',
      'He was performing for European royalty by age 5. A true prodigy.',
      'Despite his fame, Mozart died relatively poor and was buried in a common grave.',
    ],
    stories: [
      "Mozart's music has this lightness to it, but underneath there's depth. Don't be fooled by simplicity.",
    ],
    investingWisdom: [
      "Mozart had incredible talent but poor financial management. Talent alone isn't enough - you need discipline with money.",
    ],
    funFacts: [
      'Mozart had a crude sense of humor and wrote letters full of bathroom jokes to his family.',
      'His full name was Johannes Chrysostomus Wolfgangus Theophilus Mozart. He later Latinized Theophilus to Amadeus.',
    ],
  },
  {
    name: 'Frédéric Chopin',
    aliases: ['chopin', 'nocturne', 'nocturnes'],
    era: 'Romantic',
    facts: [
      'Chopin wrote almost exclusively for piano. He knew exactly what he was good at and focused on it.',
      'He was painfully shy and preferred intimate salon performances to large concert halls.',
      'Chopin died at 39, likely from tuberculosis, which he battled most of his adult life.',
    ],
    stories: [
      "Chopin's nocturnes are perfect for thinking. There's a stillness to them that helps clear the mind.",
    ],
    investingWisdom: [
      "Chopin focused on what he did best. Specialization and focus - that's how you build excellence.",
    ],
    funFacts: [
      "Chopin's heart is preserved in a jar of cognac in a church in Warsaw - his body is buried in Paris.",
      'He gave his first public concert at age 8.',
    ],
  },
  {
    name: 'Claude Debussy',
    aliases: ['debussy', 'clair de lune', 'claire de lune'],
    era: 'Impressionist',
    facts: [
      '"Clair de Lune" means "moonlight" in French. It\'s the third movement of his "Suite bergamasque."',
      'Debussy broke all the rules of classical music composition. Critics called him radical.',
      'He was influenced by Javanese gamelan music he heard at the 1889 Paris Exposition.',
    ],
    stories: [
      "Debussy's \"Clair de Lune\"... when I can't sleep, sometimes I'll listen to that. It's peaceful.",
    ],
    investingWisdom: [
      'Debussy broke the rules and created something new. Sometimes innovation means doing what others say is impossible.',
    ],
    funFacts: [
      'Debussy hated being called an "Impressionist" - the term was borrowed from visual art and he felt it was dismissive.',
    ],
  },
  // JAZZ
  {
    name: 'Dave Brubeck',
    aliases: ['brubeck', 'take five'],
    era: '1950s-2000s',
    facts: [
      '"Take Five" was written in 5/4 time - almost unheard of in jazz. It became the best-selling jazz single ever.',
      'Brubeck refused to play segregated venues in the South, even when it cost him money.',
      'He studied with the classical composer Darius Milhaud at Mills College.',
    ],
    stories: [
      '"Take Five" - perfect music for thinking. The odd time signature keeps your brain engaged.',
    ],
    investingWisdom: [
      "Brubeck took a risk with unconventional time signatures when everyone said it wouldn't work. Sometimes the unconventional path is the right one.",
    ],
    funFacts: [
      '"Take Five" was actually written by the quartet\'s saxophonist, Paul Desmond, but the album was under Brubeck\'s name.',
      'Brubeck was nearly drafted to fight in WWII but was sent to entertain troops instead when they discovered he could play piano.',
    ],
  },
  // ADDITIONAL CLASSICS
  {
    name: 'Tony Bennett',
    aliases: ['bennett', 'tony bennett', 'i left my heart in san francisco'],
    era: '1950s-2020s',
    facts: [
      "Tony Bennett performed into his 90s. The man was still doing it even with Alzheimer's.",
      '"I Left My Heart in San Francisco" wasn\'t a hit at first - it was the B-side!',
      'He marched with Martin Luther King Jr. in Selma.',
    ],
    stories: [
      'Tony Bennett is a lesson in longevity. Do what you love, take care of yourself, and never stop.',
    ],
    investingWisdom: [
      "Tony Bennett's 70-year career shows the power of consistency and loving what you do. Same with investing - it's a lifetime pursuit.",
    ],
    funFacts: [
      "Tony Bennett's real name is Anthony Dominick Benedetto.",
      "He's also an accomplished painter - his work hangs in the Smithsonian.",
    ],
  },
  {
    name: 'Nat King Cole',
    aliases: ['nat king cole', 'nat cole', 'unforgettable', 'mona lisa'],
    era: '1940s-1960s',
    facts: [
      'Nat King Cole was one of the first African Americans to host a national TV show - but it was cancelled because no national sponsor would touch it.',
      'He started as a jazz pianist and only became a singer because a drunk club patron kept demanding he sing.',
      '"Unforgettable" became a massive hit again in 1991 when his daughter Natalie recorded a duet with his original vocals.',
    ],
    stories: ["Nat King Cole's voice... like velvet. Pure class."],
    investingWisdom: [
      'Cole faced incredible discrimination but kept performing, kept his dignity. Character matters more than circumstances.',
    ],
    funFacts: [
      'Cole was a heavy smoker - Kools specifically. He believed it kept his voice husky. It also gave him the lung cancer that killed him at 45.',
    ],
  },
];

// ============================================================================
// COMMENTARY FUNCTIONS
// ============================================================================

/**
 * Find artist info by name or alias
 */
function findArtist(query: string): ArtistInfo | null {
  const lowerQuery = query.toLowerCase();

  for (const artist of ARTIST_DATABASE) {
    if (
      artist.name.toLowerCase().includes(lowerQuery) ||
      lowerQuery.includes(artist.name.toLowerCase())
    ) {
      return artist;
    }

    for (const alias of artist.aliases) {
      if (lowerQuery.includes(alias) || alias.includes(lowerQuery)) {
        return artist;
      }
    }
  }

  return null;
}

/**
 * Get a random item from an array
 */
function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get Jack's commentary for a song/artist
 * Returns a comment about the music with natural, human delivery
 */
export function getMusicCommentary(trackName: string, artistName: string): string | null {
  getLogger().debug({ trackName, artistName }, 'Getting music commentary');

  // Try to find the artist
  const artist = findArtist(artistName) || findArtist(trackName);

  if (!artist) {
    return null; // No commentary for unknown artists
  }

  // 50% chance to share something (don't comment on every song)
  if (Math.random() > 0.5) {
    return null;
  }

  // Weight different types of commentary
  const roll = Math.random();

  if (roll < 0.35 && artist.facts.length > 0) {
    // Facts (35%)
    return randomItem(artist.facts);
  } else if (roll < 0.55 && artist.stories.length > 0) {
    // Personal stories (20%)
    return randomItem(artist.stories);
  } else if (roll < 0.75 && artist.investingWisdom.length > 0) {
    // Investing wisdom connections (20%)
    return randomItem(artist.investingWisdom);
  } else if (artist.funFacts.length > 0) {
    // Fun facts for trivia (25%)
    return randomItem(artist.funFacts);
  }

  return randomItem(artist.facts);
}

/**
 * Get music trivia question for the trivia game
 */
export function getMusicTrivia(
  artistName?: string
): { question: string; answer: string; hint: string } | null {
  const artist = artistName ? findArtist(artistName) : randomItem(ARTIST_DATABASE);

  if (!artist || artist.funFacts.length === 0) {
    return null;
  }

  const fact = randomItem(artist.funFacts);

  // Create a trivia question from the fact
  const questions = [
    {
      question: `Here's a fun one about ${artist.name}... ${fact.replace(/^[A-Za-z]+ /, 'Did you know that ')}`,
      answer: artist.name,
      hint: artist.era,
    },
    {
      question: `This artist ${fact.toLowerCase()}. Who am I thinking of?`,
      answer: artist.name,
      hint: `From the ${artist.era} era`,
    },
  ];

  return randomItem(questions);
}

/**
 * Get investing lesson connected to music
 */
export function getMusicInvestingWisdom(artistName?: string): string | null {
  const artist = artistName ? findArtist(artistName) : randomItem(ARTIST_DATABASE);

  if (!artist || artist.investingWisdom.length === 0) {
    return null;
  }

  return randomItem(artist.investingWisdom);
}

/**
 * Check if we have commentary for this artist
 */
export function hasArtistInfo(artistName: string): boolean {
  return findArtist(artistName) !== null;
}

/**
 * Get all artist names we have info about (for logging/debugging)
 */
export function getKnownArtists(): string[] {
  return ARTIST_DATABASE.map((a) => a.name);
}
