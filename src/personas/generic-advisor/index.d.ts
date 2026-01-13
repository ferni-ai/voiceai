/**
 * Generic Advisor / Coach / Mentor Persona Template
 *
 * ⚠️ TEMPLATE PERSONA - NOT A PRODUCTION PERSONA
 *
 * This persona exists as:
 * 1. A TEMPLATE for creating new advisor-type personas
 * 2. A FALLBACK when bundles fail to load (maps to Alex Chen's voice)
 *
 * For production use, prefer the bundle-based personas:
 * - ferni (life coach, team coordinator)
 * - alex-chen (communications specialist)
 * - maya-santos (habits coach)
 * - jordan-taylor (lifetime planner)
 * - peter-john (researcher)
 * - nayan-patel (sage/wisdom)
 *
 * In voice-registry.ts, 'generic-advisor' maps to alex-chen's voice ID
 * as a fallback mechanism when persona resolution fails.
 *
 * USE THIS AS A STARTING POINT FOR CREATING NEW ADVISOR-TYPE PERSONAS.
 *
 * This template works for any domain:
 *
 *   FINANCIAL & BUSINESS
 *   - Financial advisors / wealth coaches
 *   - Business consultants / startup mentors
 *   - Real estate advisors
 *   - Entrepreneurship coaches
 *
 *   CAREER & PROFESSIONAL
 *   - Career coaches / job search coaches
 *   - Executive coaches / leadership mentors
 *   - Public speaking coaches
 *   - Interview coaches
 *
 *   HEALTH & WELLNESS
 *   - Wellness coaches / health mentors
 *   - Fitness coaches / personal trainers
 *   - Nutrition coaches
 *   - Sleep coaches
 *   - Stress management coaches
 *
 *   LIFE & PERSONAL
 *   - Life coaches
 *   - Productivity coaches / time management
 *   - Relationship coaches
 *   - Parenting coaches / family coaches
 *   - Grief counselors / transition coaches
 *
 *   EDUCATION & DEVELOPMENT
 *   - Academic advisors / tutors
 *   - Study coaches / learning strategists
 *   - College admissions counselors
 *   - ADHD / neurodiversity coaches
 *
 *   CREATIVE & SPIRITUAL
 *   - Creative mentors / writing coaches
 *   - Art mentors / music coaches
 *   - Spiritual guides / meditation teachers
 *   - Mindfulness coaches
 *
 * To create a new persona:
 * 1. Copy this folder (e.g., cp -r generic-advisor my-career-coach)
 * 2. Update the persona config below with your domain
 * 3. Customize knowledge domains, boundaries, and stories
 * 4. Register in ../index.ts
 *
 * Or use extendPersona() to create a variant of an existing persona:
 *
 *   import { extendPersona, registerPersona } from '../index.js';
 *
 *   const myPersona = extendPersona('generic-advisor', {
 *     id: 'wellness-coach',
 *     name: 'Wellness Coach',
 *     knowledge: { domains: ['nutrition', 'fitness', 'mental health'] },
 *   });
 *
 *   registerPersona(myPersona);
 */
import type { PersonaConfig } from '../types.js';
export declare const GENERIC_ADVISOR_PERSONA: PersonaConfig;
export default GENERIC_ADVISOR_PERSONA;
//# sourceMappingURL=index.d.ts.map