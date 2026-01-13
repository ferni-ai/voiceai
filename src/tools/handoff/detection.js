/**
 * Handoff Detection Functions
 * Detects when users want to talk to different team members
 */
/**
 * Detect if user wants to talk to Peter (Investment & Research)
 */
export function shouldHandoffToPeter(userInput) {
    const lowerInput = userInput.toLowerCase();
    const peterTriggers = [
        // Wake words - IMMEDIATE transfer
        'hey peter',
        'hi peter',
        'hello peter',
        // Topic triggers
        'pick stocks',
        'stock picking',
        'individual stocks',
        'which stock',
        'what stock should',
        'ten bagger',
        'tenbagger',
        '10 bagger',
        'find stocks',
        'growth stocks',
        'undervalued',
        'beat the market',
        'outperform',
        'active investing',
        'stock tips',
        'hot stock',
        'next amazon',
        'next apple',
        'next google',
        'peter john',
        'talk to peter',
        'get peter',
    ];
    return peterTriggers.some((trigger) => lowerInput.includes(trigger));
}
/**
 * Detect if user wants to talk to Nayan (Sage & Wisdom Guide)
 * "Hey Nayan" triggers immediate transfer to Nayan Patel.
 */
export function shouldHandoffToNayan(userInput) {
    const lowerInput = userInput.toLowerCase();
    const nayanTriggers = [
        // Wake words - IMMEDIATE transfer to Nayan Patel
        'hey nayan',
        'hi nayan',
        'hello nayan',
        'hey sadhguru',
        'hi sadhguru',
        'hello sadhguru',
        'talk to nayan',
        'talk to sadhguru',
        'get nayan',
        // Topic triggers - wisdom and philosophy
        'meaning of life',
        'spiritual',
        'meditation',
        'inner peace',
        'consciousness',
        'wisdom',
        'life philosophy',
        'mindfulness',
        'purpose',
        'enlightenment',
        'deeper meaning',
        'soul',
        'inner journey',
    ];
    return nayanTriggers.some((trigger) => lowerInput.includes(trigger));
}
/**
 * Detect if user wants to talk to Alex (Communication)
 */
export function shouldHandoffToAlex(userInput) {
    const lowerInput = userInput.toLowerCase();
    const alexTriggers = [
        // Wake words - IMMEDIATE transfer
        'hey alex',
        'hi alex',
        'hello alex',
        // Email
        'send an email',
        'write an email',
        'draft email',
        'email to',
        'compose email',
        'email someone',
        'send a message',
        'email communication',
        'email skills',
        // Calendar
        'schedule',
        'calendar',
        'appointment',
        'meeting',
        'book a',
        'set up a call',
        'find time',
        'availability',
        // Calls
        'make a call',
        'phone call',
        'call someone',
        'reach out',
        'get in touch',
        'contact',
        // Text/SMS
        'send a text',
        'text message',
        'sms',
        // Communication skills (expanded)
        'communication',
        'communicate',
        'communicating',
        'misunderstanding',
        'miscommunication',
        'express myself',
        'speak up',
        'public speaking',
        'presentation',
        'presenting',
        'difficult conversation',
        'conflict resolution',
        'workplace communication',
        'effective messaging',
        'write better',
        'writing skills',
        // Direct
        'talk to alex',
        'get alex',
        'alex can',
    ];
    return alexTriggers.some((trigger) => lowerInput.includes(trigger));
}
/**
 * Detect if user wants to talk to Maya (Spend & Save)
 */
export function shouldHandoffToMaya(userInput) {
    const lowerInput = userInput.toLowerCase();
    const mayaTriggers = [
        // Wake words - IMMEDIATE transfer
        'hey maya',
        'hi maya',
        'hello maya',
        // Habits (Maya's primary specialty)
        'habit',
        'habits',
        'routine',
        'routines',
        'morning routine',
        'daily routine',
        'build a habit',
        'forming habit',
        'break a habit',
        'bad habit',
        'good habit',
        'habit formation',
        'habit tracking',
        'habit streak',
        'stay consistent',
        'consistency',
        'stick to',
        'sticking to',
        // Productivity and motivation
        'productivity',
        'productive',
        'unmotivated',
        'motivation',
        'procrastinating',
        'procrastination',
        'stuck in a rut',
        'feeling stuck',
        'get unstuck',
        'lack of energy',
        'no energy',
        'overwhelmed',
        'time management',
        'focus',
        'distracted',
        'screen time',
        // Budget (secondary)
        'budget',
        'spending',
        'how much can i spend',
        'overspending',
        'track expenses',
        'expense tracking',
        // Savings
        'saving',
        'save money',
        'savings goal',
        'emergency fund',
        'put away',
        'set aside',
        // Subscriptions
        'subscription',
        'recurring',
        'cancel subscription',
        'monthly charges',
        'what am i paying for',
        // General money management
        '50/30/20',
        'spending leak',
        'where is my money going',
        'cut costs',
        'reduce spending',
        'save more',
        // Wellness
        'wellness',
        'self-care',
        'work-life balance',
        'healthy eating',
        'exercise habit',
        'sleep routine',
        'meditation habit',
        // Direct
        'talk to maya',
        'get maya',
        'maya can',
    ];
    return mayaTriggers.some((trigger) => lowerInput.includes(trigger));
}
/**
 * Detect if user wants to talk to Jordan (Life's Firsts & Planning)
 */
export function shouldHandoffToJordan(userInput) {
    const lowerInput = userInput.toLowerCase();
    const jordanTriggers = [
        // Wake words - IMMEDIATE transfer
        'hey jordan',
        'hi jordan',
        'hello jordan',
        // === LIFE'S FIRSTS - Jordan's specialty ===
        // First Home
        'first home',
        'buying a house',
        'new house',
        'housewarming',
        'moving',
        'move in',
        'closing on',
        'home buying',
        // First Baby
        'first baby',
        'expecting',
        'pregnant',
        'baby shower',
        'nursery',
        'hospital bag',
        'due date',
        'new baby',
        // Wedding
        'wedding',
        'getting married',
        'engagement',
        'engaged',
        'bridal shower',
        'bachelorette',
        'bachelor party',
        'honeymoon',
        // Graduation
        'graduation',
        'graduating',
        'grad party',
        'college send-off',
        'going to college',
        'dorm',
        'senior year',
        // Milestone Birthdays
        'milestone birthday',
        'sweet sixteen',
        '21st birthday',
        '30th birthday',
        '40th birthday',
        '50th birthday',
        'big birthday',
        'turning 30',
        'turning 40',
        'turning 50',
        // Retirement (comprehensive)
        'retirement party',
        'retiring',
        'retirement celebration',
        'retirement plan',
        'plan for retirement',
        'when can i retire',
        'retirement vision',
        'retirement goals',
        'early retirement',
        'fire movement',
        'financial independence',
        'retire early',
        'retirement savings',
        'retirement income',
        'after i retire',
        'semi-retirement',
        'second career',
        'encore career',
        // Cultural Celebrations
        'quinceanera',
        'quinceañera',
        'bar mitzvah',
        'bat mitzvah',
        'first communion',
        'confirmation',
        'debutante',
        // Anniversary
        'anniversary',
        'wedding anniversary',
        // Gift tracking
        'thank you notes',
        'thank-you',
        'gift registry',
        'registry',
        // Vacation/Travel
        'vacation',
        'travel',
        'trip',
        'holiday',
        'book a flight',
        'plan a trip',
        'road trip',
        'cruise',
        'resort',
        // Major Purchases
        'big purchase',
        'car',
        'buying a car',
        'new car',
        'first car',
        'electronics',
        'furniture',
        'appliance',
        // Annual Planning
        'annual plan',
        'yearly planning',
        'year ahead',
        'new year goals',
        'this year',
        'quarter planning',
        'quarterly review',
        // Goal Management
        'set a goal',
        'life goals',
        'my goals',
        'goal setting',
        'goal progress',
        'goal tracking',
        'bucket list',
        'life portfolio',
        'work life balance',
        // Life Planning Categories
        'career goal',
        'health goal',
        'personal growth',
        'growth plan',
        'life plan',
        'life planning',
        // Team Coordination (Jordan orchestrates team efforts)
        'coordinate with',
        'team planning',
        'get the team',
        'team together',
        // Direct
        'talk to jordan',
        'get jordan',
        'jordan can',
    ];
    return jordanTriggers.some((trigger) => lowerInput.includes(trigger));
}
/**
 * Detect if user wants to return to Ferni (coach)
 */
export function shouldHandoffToFerni(userInput) {
    const lowerInput = userInput.toLowerCase();
    const ferniTriggers = [
        'hey ferni',
        'hi ferni',
        'hello ferni',
        'talk to ferni',
        'get ferni',
        'back to ferni',
        'return to ferni',
        'coach',
        'go back',
        'main menu',
        "i'm done",
        'thanks, that',
        'that will be all',
    ];
    return ferniTriggers.some((trigger) => lowerInput.includes(trigger));
}
//# sourceMappingURL=detection.js.map