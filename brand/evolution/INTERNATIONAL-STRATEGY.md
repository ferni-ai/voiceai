# Ferni International Strategy
## Localization & Cultural Adaptation Framework

**Version 1.0 | January 2026**

---

> *"Ferni should feel like a local friend everywhere in the world, not a translated American app."*

---

## Philosophy

### Localization vs. Translation

**Translation:** Converting words from one language to another
**Localization:** Adapting the entire experience for a culture

Ferni requires deep localization because:
- Emotional support is culturally contextual
- Communication styles vary dramatically
- Relationship metaphors differ
- What feels "warm" differs by culture

---

## Market Prioritization

### Tier 1 Markets (Year 1)

| Market | Language | Population | Rationale |
|--------|----------|------------|-----------|
| **USA** | English | 330M | Current market |
| **UK** | English | 67M | Language alignment, cultural proximity |
| **Canada** | English/French | 38M | Proximity, bilingual |
| **Australia** | English | 26M | Language alignment |

### Tier 2 Markets (Year 1-2)

| Market | Language | Population | Rationale |
|--------|----------|------------|-----------|
| **Spain/LatAm** | Spanish | 500M+ | Large market, cultural value on relationships |
| **Germany** | German | 100M+ | Tech-forward, wellness interest |
| **Japan** | Japanese | 125M | AI adoption, emotional intelligence interest |

### Tier 3 Markets (Year 2+)

| Market | Language | Population | Rationale |
|--------|----------|------------|-----------|
| **France** | French | 67M | Wellness market |
| **Brazil** | Portuguese | 215M | Huge market, emotional culture |
| **South Korea** | Korean | 52M | Tech adoption, mental health awareness |
| **Netherlands** | Dutch/English | 17M | High English proficiency, tech-forward |

---

## Localization Framework

### Layer 1: Language Translation

**What:** Core text content in target language

**Elements:**
- UI strings
- Persona responses
- Prompts and questions
- Error messages
- Marketing content

**Approach:**
- Professional translation (not just machine)
- Native speaker review
- Cultural consultant validation
- User testing with locals

### Layer 2: Cultural Adaptation

**What:** Adjusting content for cultural context

**Elements:**
- Metaphors and idioms
- Humor style
- Formality levels
- Relationship dynamics
- Emotional expression norms

**Example:**
| English | Japanese Cultural Adaptation |
|---------|------------------------------|
| "Let's tackle that problem!" | "Let's consider this carefully together." |
| "You've got this!" | "I believe in your ability." |
| "Tell me more." | "Please share if you're comfortable." |

### Layer 3: Persona Adaptation

**What:** Adjusting personas for cultural resonance

**Considerations:**
- Age connotations
- Gender expectations
- Authority relationships
- Mentor archetypes

**Example - "Wise Mentor" Archetype:**
| Culture | Adaptation |
|---------|------------|
| USA | Friendly coach, peer relationship |
| Japan | Respected senior (senpai), more formal |
| Germany | Expert advisor, direct communication |
| LatAm | Family elder, warm and nurturing |

### Layer 4: Visual Adaptation

**What:** Adjusting visuals for cultural preference

**Elements:**
- Color meanings
- Avatar expressions
- Imagery style
- Layout direction (RTL/LTR)

**Color Considerations:**
| Color | Western | Japanese | Chinese |
|-------|---------|----------|---------|
| White | Purity, clean | Mourning | Mourning |
| Green | Nature, growth | Youth, vitality | Prosperity |
| Red | Urgency, passion | Celebration | Luck, joy |

### Layer 5: Voice Adaptation

**What:** TTS voices that feel native

**Requirements:**
- Native accent for target market
- Age-appropriate voice
- Gender options
- Warmth in local context

---

## Persona Localization Guide

### Ferni Localization

**Core to maintain:**
- Warmth, curiosity, groundedness
- Questions over statements
- Space for silence
- Non-judgmental presence

**Adaptations by market:**

| Market | Communication Style | Formality |
|--------|---------------------|-----------|
| USA | Direct, enthusiastic | Casual |
| UK | Understated, wry | Moderate |
| Japan | Indirect, respectful | Formal |
| Germany | Direct, logical | Moderate |
| LatAm | Warm, expressive | Casual-warm |

### Sample Localized Responses

**"Tell me more about that."**

| Market | Localized Version |
|--------|-------------------|
| USA | "Tell me more about that." |
| UK | "I'd love to hear more." |
| Japan | "もしよろしければ、もう少し教えていただけますか？" (If you don't mind, could you tell me a bit more?) |
| Germany | "Erzähl mir mehr darüber." |
| LatAm | "Cuéntame más, me interesa mucho." (Tell me more, I'm very interested.) |

---

## Technical Localization

### App Localization

**Supported frameworks:**
- iOS: NSLocalizedString
- Android: strings.xml
- Web: i18n libraries

**Process:**
1. String extraction
2. Translation management (Phrase, Lokalise)
3. Review by native speakers
4. QA in-context
5. User testing
6. Iteration

### Voice Localization

**TTS Requirements:**
- Native accent options
- Multiple voice personas
- SSML support for all languages
- Emotion markers that work cross-culturally

**Voice Partners:**
- Elevenlabs (multilingual)
- Amazon Polly (neural voices)
- Google Cloud TTS
- Local specialists for specific markets

### Date/Time/Number Localization

| Element | Considerations |
|---------|----------------|
| Date format | MM/DD/YYYY vs DD/MM/YYYY vs YYYY/MM/DD |
| Time format | 12h vs 24h |
| Number format | 1,000.00 vs 1.000,00 |
| Currency | Symbol, position |
| Week start | Sunday vs Monday |

---

## Market Entry Playbook

### Phase 1: Research (Month 1)

**Activities:**
- [ ] Market size analysis
- [ ] Competitive landscape
- [ ] Cultural consultation
- [ ] User research (10+ interviews with locals)
- [ ] Regulatory review (data privacy, AI regulations)

**Deliverables:**
- Market brief
- Cultural adaptation guide
- User personas for market
- Go/no-go recommendation

### Phase 2: Localization (Months 2-3)

**Activities:**
- [ ] Core translation
- [ ] Cultural adaptation of responses
- [ ] Voice selection and testing
- [ ] Visual review and adaptation
- [ ] QA with native speakers

**Deliverables:**
- Localized app build
- Localized marketing materials
- Market-specific brand guidelines

### Phase 3: Soft Launch (Month 4)

**Activities:**
- [ ] Limited beta release
- [ ] User feedback collection
- [ ] Performance monitoring
- [ ] Cultural validation
- [ ] Iteration based on feedback

**Deliverables:**
- Beta metrics
- Feedback synthesis
- Launch readiness assessment

### Phase 4: Full Launch (Month 5)

**Activities:**
- [ ] App Store/Play Store listing
- [ ] Local PR/marketing
- [ ] Community seeding
- [ ] Support infrastructure
- [ ] Ongoing monitoring

**Deliverables:**
- Live localized product
- Local community presence
- Support coverage

---

## Cultural Sensitivity Guidelines

### Universal Don'ts

❌ Assume American culture is "default"
❌ Use idioms without checking cultural fit
❌ Ignore local mental health stigma considerations
❌ Use humor that doesn't translate
❌ Make assumptions about family structures
❌ Ignore religious/spiritual contexts

### Market-Specific Considerations

#### Japan
- High context communication (less explicit)
- Respect hierarchies in language
- Indirect expression of emotions is normal
- "Honne" (true feelings) vs "Tatemae" (public facade)
- Mental health stigma—approach carefully

#### Germany
- Direct communication preferred
- Value expertise and credentials
- Privacy highly valued (GDPR origins)
- Separate formal/informal relationships
- Quality over speed

#### Latin America
- Warm, relationship-first
- Family is central
- Emotional expressiveness valued
- Religion may be relevant
- Flexible with time

#### UK
- Understatement and subtlety
- Self-deprecating humor
- Queue culture (patience valued)
- Class awareness
- Politeness structures

---

## Support Infrastructure

### Localized Support

| Tier | Coverage | Hours |
|------|----------|-------|
| **Tier 1** | Email, Help Center | Business hours (local) |
| **Tier 2** | Live chat | Extended hours |
| **Tier 3** | Phone/video | Premium users |

### Crisis Resources by Region

Each market needs localized crisis resources:

| Market | Crisis Resource |
|--------|-----------------|
| USA | 988 Suicide & Crisis Lifeline |
| UK | Samaritans (116 123) |
| Canada | 988 |
| Australia | Lifeline (13 11 14) |
| Japan | Yorisoi Hotline (0120-279-338) |
| Germany | Telefonseelsorge (0800-1110111) |

---

## Community Localization

### Local Community Chapters

For Tier 2+ markets, consider:
- Local Discord channels
- Market-specific ambassadors
- Translated community content
- Local events/meetups

### Content Localization

| Content Type | Localization Level |
|--------------|-------------------|
| App UI | Full translation |
| Help Center | Full translation |
| Marketing | Cultural adaptation |
| Community | Local + translated |
| Blog | Selected posts |

---

## Metrics & Success

### Launch Metrics

| Metric | Target |
|--------|--------|
| Downloads (first month) | Market-specific |
| Day 7 retention | 40%+ |
| User satisfaction | 4.5+ stars |
| NPS | 40+ |

### Cultural Fit Metrics

| Metric | Target |
|--------|--------|
| "Feels natural" (survey) | 80%+ |
| Completion rate (onboarding) | 60%+ |
| Cultural offense reports | Near zero |
| Local referral rate | 20%+ |

---

## Budget Framework

### Per-Market Localization Cost

| Category | Estimate |
|----------|----------|
| Translation (core) | $10,000-20,000 |
| Cultural adaptation | $5,000-15,000 |
| Voice recording/licensing | $5,000-10,000 |
| User research | $5,000-10,000 |
| QA and testing | $3,000-5,000 |
| Marketing localization | $5,000-10,000 |
| **Total per market** | **$33,000-70,000** |

### Ongoing Costs

| Category | Monthly |
|----------|---------|
| Translation updates | $1,000-2,000 |
| Support (localized) | $2,000-5,000 |
| Marketing | $5,000-10,000 |

---

## Appendix: Localization Checklist

### Pre-Launch
- [ ] Cultural consultant engaged
- [ ] User research completed
- [ ] Core translation complete
- [ ] Cultural adaptation reviewed
- [ ] Voices selected and tested
- [ ] Crisis resources localized
- [ ] Legal/regulatory compliance
- [ ] App Store listing localized
- [ ] Help Center localized
- [ ] Support processes established

### Post-Launch
- [ ] User feedback monitoring
- [ ] Cultural fit surveys
- [ ] Iteration plan active
- [ ] Local community building
- [ ] Ongoing translation updates
- [ ] Performance dashboards

---

**Document Owner:** International Lead  
**Last Updated:** January 2026  
**Review Cycle:** Per market launch

---

*"Ferni should feel like it was made for each culture, not just translated into it."*
