/**
 * SSML Constants - Single Source of Truth
 *
 * All constant definitions for SSML generation and processing.
 * This is the CANONICAL source for all SSML-related constants.
 *
 * Other modules should import from here:
 * ```typescript
 * import { FINANCIAL_PRONUNCIATIONS, EMOTION_KEYWORDS } from '../ssml/constants.js';
 * ```
 *
 * @module ssml/constants
 */

import type { PronunciationEntry } from './types.js';

// =============================================================================
// UNICODE MARKERS FOR FINANCIAL TERM PROTECTION
// =============================================================================

export const FINANCIAL_START = '\uE001';
export const FINANCIAL_END = '\uE002';

// =============================================================================
// FINANCIAL PRONUNCIATION DICTIONARY
// Maps financial terms to their phonetic "sounds-like" pronunciations
// =============================================================================

export const FINANCIAL_PRONUNCIATIONS: PronunciationEntry[] = [
  // -------------------------------------------------------------------------
  // Retirement Accounts
  // -------------------------------------------------------------------------
  { pattern: /\b401\s*[Kk]\b/g, replacement: 'four oh one K', description: 'Retirement account' },
  { pattern: /\b401\s*\(k\)\b/gi, replacement: 'four oh one K', description: 'Retirement account' },
  {
    pattern: /\b403\s*[Bb]\b/g,
    replacement: 'four oh three B',
    description: 'Nonprofit retirement',
  },
  {
    pattern: /\b457\s*[Bb]?\b/g,
    replacement: 'four fifty seven',
    description: 'Government retirement',
  },
  { pattern: /\bIRA\b/g, replacement: 'I R A', description: 'Individual Retirement Account' },
  { pattern: /\bRoth\s+IRA\b/gi, replacement: 'Roth I R A', description: 'After-tax retirement' },
  {
    pattern: /\bSEP[\s-]?IRA\b/gi,
    replacement: 'sep I R A',
    description: 'Self-employed retirement',
  },
  {
    pattern: /\bSIMPLE[\s-]?IRA\b/gi,
    replacement: 'simple I R A',
    description: 'Small business retirement',
  },

  // -------------------------------------------------------------------------
  // Regulatory Bodies
  // -------------------------------------------------------------------------
  { pattern: /\bSEC\b/g, replacement: 'S E C', description: 'Securities and Exchange Commission' },
  {
    pattern: /\bFINRA\b/g,
    replacement: 'fin-rah',
    description: 'Financial Industry Regulatory Authority',
  },
  {
    pattern: /\bFDIC\b/g,
    replacement: 'F D I C',
    description: 'Federal Deposit Insurance Corporation',
  },
  { pattern: /\bFed\b/g, replacement: 'Fed', description: 'Federal Reserve' },
  { pattern: /\bFOMC\b/g, replacement: 'F O M C', description: 'Federal Open Market Committee' },
  {
    pattern: /\bCFPB\b/g,
    replacement: 'C F P B',
    description: 'Consumer Financial Protection Bureau',
  },
  { pattern: /\bOCC\b/g, replacement: 'O C C', description: 'Office of the Comptroller' },
  { pattern: /\bSIPC\b/g, replacement: 'S I P C', description: 'Securities Investor Protection' },

  // -------------------------------------------------------------------------
  // Indices and Markets
  // -------------------------------------------------------------------------
  { pattern: /\bS&P\s*500\b/gi, replacement: 'S and P five hundred', description: 'Stock index' },
  { pattern: /\bS&P\b/gi, replacement: 'S and P', description: 'Standard and Poors' },
  { pattern: /\bDJIA\b/g, replacement: 'Dow Jones Industrial Average', description: 'Dow index' },
  { pattern: /\bDow\s+Jones\b/gi, replacement: 'Dow Jones', description: 'Market index' },
  { pattern: /\bNASDAQ\b/gi, replacement: 'NASDAQ', description: 'Tech exchange' },
  { pattern: /\bNYSE\b/g, replacement: 'N Y S E', description: 'New York Stock Exchange' },
  { pattern: /\bVIX\b/g, replacement: 'vix', description: 'Volatility index' },
  { pattern: /\bETF\b/g, replacement: 'E T F', description: 'Exchange Traded Fund' },
  { pattern: /\bETFs\b/g, replacement: 'E T Fs', description: 'Exchange Traded Funds' },
  { pattern: /\bREIT\b/g, replacement: 'reet', description: 'Real Estate Investment Trust' },
  { pattern: /\bREITs\b/g, replacement: 'reets', description: 'Real Estate Investment Trusts' },

  // -------------------------------------------------------------------------
  // Fund Types (Vanguard specific)
  // -------------------------------------------------------------------------
  { pattern: /\bVTI\b/g, replacement: 'V T I', description: 'Vanguard Total Stock' },
  { pattern: /\bVOO\b/g, replacement: 'V O O', description: 'Vanguard S&P 500' },
  { pattern: /\bVTSAX\b/g, replacement: 'V T sax', description: 'Vanguard Total Stock Admiral' },
  { pattern: /\bVFIAX\b/g, replacement: 'V F I ax', description: 'Vanguard 500 Admiral' },
  { pattern: /\bVBTLX\b/g, replacement: 'V B T L X', description: 'Vanguard Bond' },
  { pattern: /\bVXUS\b/g, replacement: 'V X U S', description: 'Vanguard International' },

  // -------------------------------------------------------------------------
  // Financial Metrics
  // -------------------------------------------------------------------------
  { pattern: /\bP\/E\b/g, replacement: 'P E ratio', description: 'Price to Earnings' },
  { pattern: /\bEPS\b/g, replacement: 'E P S', description: 'Earnings Per Share' },
  { pattern: /\bROI\b/g, replacement: 'R O I', description: 'Return on Investment' },
  { pattern: /\bROE\b/g, replacement: 'R O E', description: 'Return on Equity' },
  { pattern: /\bNAV\b/g, replacement: 'N A V', description: 'Net Asset Value' },
  { pattern: /\bAUM\b/g, replacement: 'A U M', description: 'Assets Under Management' },
  { pattern: /\bTER\b/g, replacement: 'T E R', description: 'Total Expense Ratio' },
  { pattern: /\bYTD\b/g, replacement: 'year to date', description: 'Year to Date' },
  { pattern: /\bQoQ\b/g, replacement: 'quarter over quarter', description: 'Quarter comparison' },
  { pattern: /\bYoY\b/g, replacement: 'year over year', description: 'Year comparison' },
  { pattern: /\bCAPM\b/g, replacement: 'cap M', description: 'Capital Asset Pricing Model' },
  { pattern: /\bEBITDA\b/g, replacement: 'E bit dah', description: 'Earnings metric' },

  // -------------------------------------------------------------------------
  // Account Types
  // -------------------------------------------------------------------------
  { pattern: /\bHSA\b/g, replacement: 'H S A', description: 'Health Savings Account' },
  { pattern: /\bFSA\b/g, replacement: 'F S A', description: 'Flexible Spending Account' },
  { pattern: /\bESA\b/g, replacement: 'E S A', description: 'Education Savings Account' },
  { pattern: /\b529\b/g, replacement: 'five twenty nine', description: 'Education savings plan' },
  { pattern: /\bUGMA\b/g, replacement: 'U G M A', description: 'Uniform Gifts to Minors' },
  { pattern: /\bUTMA\b/g, replacement: 'U T M A', description: 'Uniform Transfers to Minors' },

  // -------------------------------------------------------------------------
  // Trading Terms
  // -------------------------------------------------------------------------
  { pattern: /\bIPO\b/g, replacement: 'I P O', description: 'Initial Public Offering' },
  { pattern: /\bSPAC\b/g, replacement: 'spac', description: 'Special Purpose Acquisition' },
  { pattern: /\bDCA\b/g, replacement: 'D C A', description: 'Dollar Cost Averaging' },
  { pattern: /\bCDs\b/g, replacement: 'C Ds', description: 'Certificates of Deposit' },
  { pattern: /\bCD\b/g, replacement: 'C D', description: 'Certificate of Deposit' },
  { pattern: /\bAPY\b/g, replacement: 'A P Y', description: 'Annual Percentage Yield' },
  { pattern: /\bAPR\b/g, replacement: 'A P R', description: 'Annual Percentage Rate' },

  // -------------------------------------------------------------------------
  // Basis Points and Percentages
  // -------------------------------------------------------------------------
  { pattern: /\b(\d+)\s*bps\b/gi, replacement: '$1 basis points', description: 'Basis points' },
  { pattern: /\b(\d+)\s*bp\b/gi, replacement: '$1 basis points', description: 'Basis point' },

  // -------------------------------------------------------------------------
  // Money Amounts
  // -------------------------------------------------------------------------
  { pattern: /\$(\d+)k\b/gi, replacement: '$1 thousand dollars', description: 'Thousands' },
  { pattern: /\$(\d+)m\b/gi, replacement: '$1 million dollars', description: 'Millions' },
  { pattern: /\$(\d+)b\b/gi, replacement: '$1 billion dollars', description: 'Billions' },
  { pattern: /\$(\d+)t\b/gi, replacement: '$1 trillion dollars', description: 'Trillions' },

  // -------------------------------------------------------------------------
  // Common Bogle/Vanguard Terms
  // -------------------------------------------------------------------------
  { pattern: /\bVanguard\b/g, replacement: 'Vanguard', description: 'Company name' },
  { pattern: /\bBogle\b/g, replacement: 'Bogul', description: 'Name pronunciation' },
  { pattern: /\bindex\s+fund/gi, replacement: 'index fund', description: 'Investment type' },
  { pattern: /\bexpense\s+ratio/gi, replacement: 'expense ratio', description: 'Fund cost metric' },

  // -------------------------------------------------------------------------
  // Tax Forms and Filings
  // -------------------------------------------------------------------------
  { pattern: /\b10-K\b/g, replacement: 'ten K', description: 'SEC annual filing' },
  { pattern: /\b10-Q\b/g, replacement: 'ten Q', description: 'SEC quarterly filing' },
  { pattern: /\b8-K\b/g, replacement: 'eight K', description: 'SEC current report' },
  { pattern: /\bW-2\b/g, replacement: 'W two', description: 'Tax form' },
  { pattern: /\bW-4\b/g, replacement: 'W four', description: 'Tax form' },
  { pattern: /\bW-9\b/g, replacement: 'W nine', description: 'Tax form' },
  { pattern: /\b1099\b/g, replacement: 'ten ninety-nine', description: 'Tax form' },
  { pattern: /\b1040\b/g, replacement: 'ten forty', description: 'Tax form' },
  { pattern: /\bSchedule\s+C\b/gi, replacement: 'Schedule C', description: 'Tax schedule' },
  { pattern: /\bSchedule\s+K-1\b/gi, replacement: 'Schedule K one', description: 'Tax schedule' },

  // -------------------------------------------------------------------------
  // Credit and Lending
  // -------------------------------------------------------------------------
  { pattern: /\bFICO\b/g, replacement: 'fy-ko', description: 'Credit score' },
  { pattern: /\bHELOC\b/g, replacement: 'hee-lock', description: 'Home Equity Line of Credit' },
  { pattern: /\bARM\b/g, replacement: 'adjustable rate mortgage', description: 'Mortgage type' },
  { pattern: /\bPMI\b/g, replacement: 'P M I', description: 'Private Mortgage Insurance' },
  { pattern: /\bLTV\b/g, replacement: 'L T V', description: 'Loan to Value' },
  { pattern: /\bDTI\b/g, replacement: 'D T I', description: 'Debt to Income' },

  // -------------------------------------------------------------------------
  // Investment Strategies
  // -------------------------------------------------------------------------
  {
    pattern: /\bFIRE\b/g,
    replacement: 'fire movement',
    description: 'Financial Independence Retire Early',
  },
  { pattern: /\bDRIP\b/g, replacement: 'drip', description: 'Dividend Reinvestment Plan' },
  { pattern: /\bTLH\b/g, replacement: 'T L H', description: 'Tax Loss Harvesting' },

  // -------------------------------------------------------------------------
  // Percentages and Numbers
  // -------------------------------------------------------------------------
  { pattern: /\b(\d+(?:\.\d+)?)\s*%/g, replacement: '$1 percent', description: 'Percentage' },
  { pattern: /\b(\d+)\s*x\s+/gi, replacement: '$1 times ', description: 'Multiplier' },

  // -------------------------------------------------------------------------
  // Common Financial Abbreviations
  // -------------------------------------------------------------------------
  { pattern: /\bAGI\b/g, replacement: 'A G I', description: 'Adjusted Gross Income' },
  { pattern: /\bMAGI\b/g, replacement: 'M A G I', description: 'Modified Adjusted Gross Income' },
  { pattern: /\bRMD\b/g, replacement: 'R M D', description: 'Required Minimum Distribution' },
  { pattern: /\bQBI\b/g, replacement: 'Q B I', description: 'Qualified Business Income' },
  { pattern: /\bNII\b/g, replacement: 'N I I', description: 'Net Investment Income' },
  { pattern: /\bPIA\b/g, replacement: 'P I A', description: 'Primary Insurance Amount' },
  { pattern: /\bFPL\b/g, replacement: 'F P L', description: 'Federal Poverty Level' },
  { pattern: /\bCOLA\b/g, replacement: 'cola', description: 'Cost of Living Adjustment' },

  // -------------------------------------------------------------------------
  // Ferni Team Personas (ensure consistent pronunciation)
  // -------------------------------------------------------------------------
  { pattern: /\bFerni\b/g, replacement: 'Furr-nee', description: 'Persona name' },
  { pattern: /\bNayan\b/g, replacement: 'Nuh-yahn', description: 'Persona name' },
  { pattern: /\bMaya\b/g, replacement: 'My-uh', description: 'Persona name' },
  // Alex, Jordan, Peter are standard English pronunciations

  // =========================================================================
  // LIFE COACHING & MENTAL HEALTH
  // =========================================================================

  // -------------------------------------------------------------------------
  // Therapy Types & Approaches
  // -------------------------------------------------------------------------
  { pattern: /\bCBT\b/g, replacement: 'C B T', description: 'Cognitive Behavioral Therapy' },
  { pattern: /\bDBT\b/g, replacement: 'D B T', description: 'Dialectical Behavior Therapy' },
  {
    pattern: /\bACT\b(?!\s+on|\s+like|\s+as)/gi,
    replacement: 'A C T therapy',
    description: 'Acceptance and Commitment Therapy',
  },
  { pattern: /\bEMDR\b/g, replacement: 'E M D R', description: 'Eye Movement Desensitization' },
  { pattern: /\bIFS\b/g, replacement: 'I F S', description: 'Internal Family Systems' },
  {
    pattern: /\bMBCT\b/g,
    replacement: 'M B C T',
    description: 'Mindfulness-Based Cognitive Therapy',
  },
  {
    pattern: /\bMBSR\b/g,
    replacement: 'M B S R',
    description: 'Mindfulness-Based Stress Reduction',
  },

  // -------------------------------------------------------------------------
  // Mental Health Conditions
  // -------------------------------------------------------------------------
  {
    pattern: /\bADHD\b/g,
    replacement: 'A D H D',
    description: 'Attention Deficit Hyperactivity Disorder',
  },
  { pattern: /\bADD\b/g, replacement: 'A D D', description: 'Attention Deficit Disorder' },
  { pattern: /\bOCD\b/g, replacement: 'O C D', description: 'Obsessive Compulsive Disorder' },
  { pattern: /\bPTSD\b/g, replacement: 'P T S D', description: 'Post-Traumatic Stress Disorder' },
  { pattern: /\bGAD\b/g, replacement: 'G A D', description: 'Generalized Anxiety Disorder' },
  { pattern: /\bMDD\b/g, replacement: 'M D D', description: 'Major Depressive Disorder' },
  { pattern: /\bBPD\b/g, replacement: 'B P D', description: 'Borderline Personality Disorder' },
  { pattern: /\bASD\b/g, replacement: 'A S D', description: 'Autism Spectrum Disorder' },

  // -------------------------------------------------------------------------
  // Emotional Intelligence & Coaching Terms
  // -------------------------------------------------------------------------
  { pattern: /\bEQ\b/g, replacement: 'E Q', description: 'Emotional Intelligence' },
  { pattern: /\bIQ\b/g, replacement: 'I Q', description: 'Intelligence Quotient' },
  { pattern: /\bNLP\b/g, replacement: 'N L P', description: 'Neuro-Linguistic Programming' },

  // =========================================================================
  // WELLNESS & FITNESS (Maya's domain)
  // =========================================================================

  // -------------------------------------------------------------------------
  // Exercise & Training
  // -------------------------------------------------------------------------
  {
    pattern: /\bHIIT\b/g,
    replacement: 'hit training',
    description: 'High Intensity Interval Training',
  },
  { pattern: /\bLISS\b/g, replacement: 'liss', description: 'Low Intensity Steady State' },
  { pattern: /\bAMRAP\b/g, replacement: 'am-rap', description: 'As Many Reps As Possible' },
  { pattern: /\bEMOM\b/g, replacement: 'ee-mom', description: 'Every Minute On the Minute' },
  { pattern: /\bWOD\b/g, replacement: 'W O D', description: 'Workout of the Day' },
  {
    pattern: /\bPR\b(?=\s+(in|for|on))/gi,
    replacement: 'personal record',
    description: 'Personal Record',
  },
  {
    pattern: /\bPB\b(?=\s+(in|for|on))/gi,
    replacement: 'personal best',
    description: 'Personal Best',
  },

  // -------------------------------------------------------------------------
  // Health Metrics
  // -------------------------------------------------------------------------
  { pattern: /\bBMI\b/g, replacement: 'B M I', description: 'Body Mass Index' },
  { pattern: /\bBMR\b/g, replacement: 'B M R', description: 'Basal Metabolic Rate' },
  { pattern: /\bTDEE\b/g, replacement: 'T D E E', description: 'Total Daily Energy Expenditure' },
  { pattern: /\bVO2\s*max\b/gi, replacement: 'V O two max', description: 'Maximum oxygen uptake' },
  { pattern: /\bHRV\b/g, replacement: 'H R V', description: 'Heart Rate Variability' },
  { pattern: /\bRHR\b/g, replacement: 'resting heart rate', description: 'Resting Heart Rate' },
  { pattern: /\bBPM\b/g, replacement: 'beats per minute', description: 'Beats Per Minute' },

  // -------------------------------------------------------------------------
  // Sleep & Recovery
  // -------------------------------------------------------------------------
  { pattern: /\bREM\b/g, replacement: 'rem', description: 'Rapid Eye Movement sleep' },
  { pattern: /\bNREM\b/g, replacement: 'non-rem', description: 'Non-REM sleep' },

  // -------------------------------------------------------------------------
  // Nutrition
  // -------------------------------------------------------------------------
  {
    pattern: /\bIF\b(?=\s+(diet|fasting|protocol))/gi,
    replacement: 'intermittent fasting',
    description: 'Intermittent Fasting',
  },
  { pattern: /\bOMAD\b/g, replacement: 'oh-mad', description: 'One Meal A Day' },
  {
    pattern: /\bCICO\b/g,
    replacement: 'calories in calories out',
    description: 'Calories In Calories Out',
  },

  // =========================================================================
  // CALENDAR & TIME (Alex's domain)
  // =========================================================================

  // -------------------------------------------------------------------------
  // Quarters
  // -------------------------------------------------------------------------
  { pattern: /\bQ1\b/g, replacement: 'Q one', description: 'First quarter' },
  { pattern: /\bQ2\b/g, replacement: 'Q two', description: 'Second quarter' },
  { pattern: /\bQ3\b/g, replacement: 'Q three', description: 'Third quarter' },
  { pattern: /\bQ4\b/g, replacement: 'Q four', description: 'Fourth quarter' },

  // -------------------------------------------------------------------------
  // Time Zones
  // -------------------------------------------------------------------------
  { pattern: /\bPST\b/g, replacement: 'Pacific time', description: 'Pacific Standard Time' },
  { pattern: /\bPDT\b/g, replacement: 'Pacific time', description: 'Pacific Daylight Time' },
  { pattern: /\bEST\b/g, replacement: 'Eastern time', description: 'Eastern Standard Time' },
  { pattern: /\bEDT\b/g, replacement: 'Eastern time', description: 'Eastern Daylight Time' },
  { pattern: /\bCST\b/g, replacement: 'Central time', description: 'Central Standard Time' },
  { pattern: /\bCDT\b/g, replacement: 'Central time', description: 'Central Daylight Time' },
  { pattern: /\bMST\b/g, replacement: 'Mountain time', description: 'Mountain Standard Time' },
  { pattern: /\bMDT\b/g, replacement: 'Mountain time', description: 'Mountain Daylight Time' },
  { pattern: /\bUTC\b/g, replacement: 'U T C', description: 'Coordinated Universal Time' },
  { pattern: /\bGMT\b/g, replacement: 'G M T', description: 'Greenwich Mean Time' },
  { pattern: /\bJST\b/g, replacement: 'Japan time', description: 'Japan Standard Time' },

  // -------------------------------------------------------------------------
  // Scheduling Abbreviations
  // -------------------------------------------------------------------------
  { pattern: /\bRSVP\b/gi, replacement: 'R S V P', description: 'Please respond' },
  { pattern: /\bEOD\b/g, replacement: 'end of day', description: 'End of Day' },
  { pattern: /\bEOW\b/g, replacement: 'end of week', description: 'End of Week' },
  { pattern: /\bEOM\b/g, replacement: 'end of month', description: 'End of Month' },
  { pattern: /\bEOY\b/g, replacement: 'end of year', description: 'End of Year' },
  { pattern: /\bETA\b/g, replacement: 'E T A', description: 'Estimated Time of Arrival' },
  { pattern: /\bTBD\b/g, replacement: 'T B D', description: 'To Be Determined' },
  { pattern: /\bTBC\b/g, replacement: 'T B C', description: 'To Be Confirmed' },
  { pattern: /\bTBA\b/g, replacement: 'T B A', description: 'To Be Announced' },
  { pattern: /\bOOO\b/g, replacement: 'out of office', description: 'Out of Office' },
  { pattern: /\bWFH\b/g, replacement: 'working from home', description: 'Work From Home' },
  { pattern: /\bPTO\b/g, replacement: 'P T O', description: 'Paid Time Off' },

  // =========================================================================
  // COMMON ABBREVIATIONS (all personas)
  // =========================================================================

  // -------------------------------------------------------------------------
  // Communication Shortcuts
  // -------------------------------------------------------------------------
  { pattern: /\bASAP\b/gi, replacement: 'A sap', description: 'As Soon As Possible' },
  { pattern: /\bFYI\b/gi, replacement: 'F Y I', description: 'For Your Information' },
  { pattern: /\bFWIW\b/gi, replacement: 'for what its worth', description: 'For What Its Worth' },
  { pattern: /\bIMO\b/g, replacement: 'in my opinion', description: 'In My Opinion' },
  {
    pattern: /\bIMHO\b/g,
    replacement: 'in my humble opinion',
    description: 'In My Humble Opinion',
  },
  { pattern: /\bBTW\b/gi, replacement: 'by the way', description: 'By The Way' },
  { pattern: /\bFAQ\b/g, replacement: 'F A Q', description: 'Frequently Asked Questions' },
  { pattern: /\bFAQs\b/g, replacement: 'F A Qs', description: 'Frequently Asked Questions' },
  { pattern: /\bAKA\b/gi, replacement: 'also known as', description: 'Also Known As' },
  { pattern: /\ba\.k\.a\./gi, replacement: 'also known as', description: 'Also Known As' },
  { pattern: /\bTL;?DR\b/gi, replacement: 'T L D R', description: 'Too Long Didnt Read' },
  { pattern: /\bDIY\b/g, replacement: 'D I Y', description: 'Do It Yourself' },
  { pattern: /\bN\/A\b/gi, replacement: 'not applicable', description: 'Not Applicable' },
  { pattern: /\bvs\.?\b/gi, replacement: 'versus', description: 'Versus' },
  { pattern: /\bw\/\b/g, replacement: 'with', description: 'With' },
  { pattern: /\bw\/o\b/gi, replacement: 'without', description: 'Without' },

  // =========================================================================
  // TECHNOLOGY & DIGITAL (Alex + general)
  // =========================================================================

  // -------------------------------------------------------------------------
  // Tech Acronyms
  // -------------------------------------------------------------------------
  { pattern: /\bAI\b/g, replacement: 'A I', description: 'Artificial Intelligence' },
  { pattern: /\bML\b/g, replacement: 'M L', description: 'Machine Learning' },
  { pattern: /\bUI\b/g, replacement: 'U I', description: 'User Interface' },
  { pattern: /\bUX\b/g, replacement: 'U X', description: 'User Experience' },
  { pattern: /\bUI\/UX\b/g, replacement: 'U I U X', description: 'User Interface and Experience' },
  { pattern: /\bAPI\b/g, replacement: 'A P I', description: 'Application Programming Interface' },
  { pattern: /\bAPIs\b/g, replacement: 'A P Is', description: 'APIs plural' },
  { pattern: /\bURL\b/g, replacement: 'U R L', description: 'Web address' },
  { pattern: /\bURLs\b/g, replacement: 'U R Ls', description: 'Web addresses' },
  { pattern: /\bPDF\b/g, replacement: 'P D F', description: 'PDF document' },
  { pattern: /\bPDFs\b/g, replacement: 'P D Fs', description: 'PDF documents' },
  { pattern: /\bSSL\b/g, replacement: 'S S L', description: 'Secure Sockets Layer' },
  { pattern: /\bVPN\b/g, replacement: 'V P N', description: 'Virtual Private Network' },
  { pattern: /\bSaaS\b/g, replacement: 'sass', description: 'Software as a Service' },
  { pattern: /\biOS\b/g, replacement: 'I O S', description: 'Apple iOS' },
  { pattern: /\bGPS\b/g, replacement: 'G P S', description: 'Global Positioning System' },
  { pattern: /\bWiFi\b/gi, replacement: 'why-fye', description: 'Wireless internet' },
  { pattern: /\bWi-Fi\b/gi, replacement: 'why-fye', description: 'Wireless internet' },

  // -------------------------------------------------------------------------
  // Programming Terms (commonly mispronounced by TTS)
  // -------------------------------------------------------------------------
  { pattern: /\bGUI\b/g, replacement: 'gooey', description: 'Graphical User Interface' },
  { pattern: /\bGUIs\b/g, replacement: 'gooeys', description: 'Graphical User Interfaces' },
  { pattern: /\bCLI\b/g, replacement: 'C L I', description: 'Command Line Interface' },
  { pattern: /\bSQL\b/g, replacement: 'sequel', description: 'Database query language' },
  { pattern: /\bnginx\b/gi, replacement: 'engine-X', description: 'Web server' },
  { pattern: /\bsudo\b/g, replacement: 'soo-doo', description: 'Unix superuser command' },
  { pattern: /\bYAML\b/g, replacement: 'yam-ul', description: 'Data format' },
  { pattern: /\bJSON\b/g, replacement: 'jay-son', description: 'Data format' },
  { pattern: /\bOAuth\b/gi, replacement: 'oh-auth', description: 'Authentication protocol' },
  { pattern: /\bregex\b/gi, replacement: 'reg-ex', description: 'Regular expression' },
  { pattern: /\bchar\b(?=\s|[,;:\.])/g, replacement: 'car', description: 'Character type' },
  { pattern: /\bCUDA\b/g, replacement: 'koo-duh', description: 'NVIDIA parallel computing' },
  { pattern: /\bPOSIX\b/g, replacement: 'pah-zix', description: 'Unix standard' },
  { pattern: /\bLinux\b/g, replacement: 'LIN-ux', description: 'Operating system' },
  { pattern: /\bGNU\b/g, replacement: 'g-new', description: 'GNU project' },
  { pattern: /\bGit\b/g, replacement: 'git', description: 'Version control' },
  { pattern: /\bGitHub\b/g, replacement: 'git-hub', description: 'Code hosting' },
  {
    pattern: /\bKubernetes\b/gi,
    replacement: 'koo-ber-NET-eez',
    description: 'Container orchestration',
  },
  { pattern: /\bk8s\b/gi, replacement: 'K eights', description: 'Kubernetes abbreviation' },
  { pattern: /\bDocker\b/g, replacement: 'dock-er', description: 'Container platform' },
  { pattern: /\bAWS\b/g, replacement: 'A W S', description: 'Amazon Web Services' },
  { pattern: /\bGCP\b/g, replacement: 'G C P', description: 'Google Cloud Platform' },
  { pattern: /\bazure\b/gi, replacement: 'AZH-ur', description: 'Microsoft cloud' },
  { pattern: /\bGraphQL\b/gi, replacement: 'graf-Q-L', description: 'Query language' },
  { pattern: /\bJWT\b/g, replacement: 'J W T', description: 'JSON Web Token' },
  { pattern: /\bCSS\b/g, replacement: 'C S S', description: 'Cascading Style Sheets' },
  { pattern: /\bHTML\b/g, replacement: 'H T M L', description: 'Markup language' },
  { pattern: /\bHTTP\b/g, replacement: 'H T T P', description: 'Web protocol' },
  { pattern: /\bHTTPS\b/g, replacement: 'H T T P S', description: 'Secure web protocol' },
  { pattern: /\bSSH\b/g, replacement: 'S S H', description: 'Secure Shell' },
  { pattern: /\bFTP\b/g, replacement: 'F T P', description: 'File Transfer Protocol' },
  { pattern: /\bREST\b/g, replacement: 'rest', description: 'API architecture' },
  { pattern: /\bSDK\b/g, replacement: 'S D K', description: 'Software Development Kit' },
  { pattern: /\bIDE\b/g, replacement: 'I D E', description: 'Integrated Development Environment' },

  // -------------------------------------------------------------------------
  // Social Media & Communication
  // -------------------------------------------------------------------------
  { pattern: /\bDM\b/g, replacement: 'D M', description: 'Direct Message' },
  { pattern: /\bDMs\b/g, replacement: 'D Ms', description: 'Direct Messages' },
  { pattern: /\bIG\b/g, replacement: 'Instagram', description: 'Instagram' },
  { pattern: /\bFOMO\b/g, replacement: 'foe-moe', description: 'Fear Of Missing Out' },
  { pattern: /\bYOLO\b/g, replacement: 'yoe-loe', description: 'You Only Live Once' },
  { pattern: /\bIRL\b/g, replacement: 'in real life', description: 'In Real Life' },
  { pattern: /\bNFT\b/g, replacement: 'N F T', description: 'Non-Fungible Token' },
  { pattern: /\bNFTs\b/g, replacement: 'N F Ts', description: 'Non-Fungible Tokens' },

  // -------------------------------------------------------------------------
  // Business Titles
  // -------------------------------------------------------------------------
  { pattern: /\bCEO\b/g, replacement: 'C E O', description: 'Chief Executive Officer' },
  { pattern: /\bCFO\b/g, replacement: 'C F O', description: 'Chief Financial Officer' },
  { pattern: /\bCTO\b/g, replacement: 'C T O', description: 'Chief Technology Officer' },
  { pattern: /\bCOO\b/g, replacement: 'C O O', description: 'Chief Operating Officer' },
  { pattern: /\bCMO\b/g, replacement: 'C M O', description: 'Chief Marketing Officer' },
  { pattern: /\bVP\b/g, replacement: 'V P', description: 'Vice President' },
  { pattern: /\bHR\b/g, replacement: 'H R', description: 'Human Resources' },
  {
    pattern: /\bPM\b(?!\s*(am|pm))/gi,
    replacement: 'P M',
    description: 'Project Manager or Product Manager',
  },

  // =========================================================================
  // LIFE EVENTS (Jordan's domain)
  // =========================================================================

  // -------------------------------------------------------------------------
  // Celebrations & Milestones
  // -------------------------------------------------------------------------
  { pattern: /\bDOB\b/g, replacement: 'date of birth', description: 'Date of Birth' },
  {
    pattern: /\bSSN\b/g,
    replacement: 'social security number',
    description: 'Social Security Number',
  },

  // =========================================================================
  // CULTURAL & GEOGRAPHIC (Ferni's background)
  // =========================================================================

  // -------------------------------------------------------------------------
  // Western US / Wyoming Place Names (Ferni's home)
  // -------------------------------------------------------------------------
  { pattern: /\bTetons\b/g, replacement: 'TEE-tonz', description: 'Grand Teton mountains (plural)' },
  { pattern: /\bTeton\b/g, replacement: 'TEE-ton', description: 'Grand Teton mountain (singular)' },
  {
    pattern: /\bGrand\s+Tetons\b/gi,
    replacement: 'Grand TEE-tonz',
    description: 'Grand Tetons (plural)',
  },
  {
    pattern: /\bGrand\s+Teton\b/gi,
    replacement: 'Grand TEE-ton',
    description: 'Grand Teton (singular)',
  },
  { pattern: /\bCheyenne\b/g, replacement: 'shy-ANN', description: 'Wyoming capital' },
  { pattern: /\bLaramie\b/g, replacement: 'LAIR-uh-mee', description: 'Wyoming city' },
  { pattern: /\bShoshone\b/gi, replacement: 'sho-SHO-nee', description: 'Native nation/places' },
  { pattern: /\bDubois\b/g, replacement: 'doo-BOYZ', description: 'Wyoming town (not French)' },
  { pattern: /\bPopo\s+Agie\b/gi, replacement: 'po-PO-zhuh', description: 'Wyoming river' },
  { pattern: /\bAbsaroka\b/gi, replacement: 'ab-SORE-kuh', description: 'Mountain range' },
  { pattern: /\bBighorn\b/gi, replacement: 'BIG-horn', description: 'Bighorn mountains/river' },
  { pattern: /\bThermopolis\b/gi, replacement: 'ther-MOP-oh-lis', description: 'Wyoming town' },
  { pattern: /\bCody\b/g, replacement: 'KO-dee', description: 'Wyoming town' },
  { pattern: /\bJackson\s+Hole\b/gi, replacement: 'JACK-son hole', description: 'Wyoming valley' },
  { pattern: /\bCoeur\s+d['']?Alene\b/gi, replacement: 'core-duh-LANE', description: 'Idaho city' },
  { pattern: /\bBoise\b/g, replacement: 'BOY-see', description: 'Idaho capital' },
  { pattern: /\bSequoia\b/gi, replacement: 'seh-KWOY-uh', description: 'Trees/park' },
  { pattern: /\bYosemite\b/gi, replacement: 'yo-SEM-ih-tee', description: 'National park' },
  { pattern: /\bWillamette\b/gi, replacement: 'wih-LAM-et', description: 'Oregon valley/river' },
  { pattern: /\bSpokan[e]?\b/gi, replacement: 'spo-CAN', description: 'Washington city' },
  { pattern: /\bPuyallup\b/gi, replacement: 'pyoo-AL-up', description: 'Washington city' },
  { pattern: /\bCascade[s]?\b/gi, replacement: 'kass-KADE', description: 'Mountain range' },

  // -------------------------------------------------------------------------
  // Colorado Place Names
  // -------------------------------------------------------------------------
  { pattern: /\bBuena\s+Vista\b/gi, replacement: 'BYOO-nuh VIS-tuh', description: 'Colorado town' },
  { pattern: /\bOuray\b/gi, replacement: 'yoo-RAY', description: 'Colorado town' },
  { pattern: /\bSalida\b/gi, replacement: 'suh-LYE-duh', description: 'Colorado town' },
  { pattern: /\bGunnison\b/gi, replacement: 'GUN-ih-son', description: 'Colorado town/river' },
  { pattern: /\bSangre\s+de\s+Cristo\b/gi, replacement: 'SANG-gruh duh KRIS-toh', description: 'Mountain range' },
  { pattern: /\bAlamosa\b/gi, replacement: 'AL-uh-MO-suh', description: 'Colorado town' },
  { pattern: /\bPueblo\b/gi, replacement: 'PWEB-lo', description: 'Colorado city' },
  { pattern: /\bSaguache\b/gi, replacement: 'suh-WATCH', description: 'Colorado county' },
  { pattern: /\bLimon\b/g, replacement: 'ly-MONE', description: 'Colorado town' },

  // -------------------------------------------------------------------------
  // Montana Place Names
  // -------------------------------------------------------------------------
  { pattern: /\bMissoula\b/gi, replacement: 'mih-ZOO-luh', description: 'Montana city' },
  { pattern: /\bBozeman\b/gi, replacement: 'BOZE-man', description: 'Montana city' },
  { pattern: /\bBillings\b/g, replacement: 'BIL-ingz', description: 'Montana city' },
  { pattern: /\bHelena\b/g, replacement: 'HEL-ih-nuh', description: 'Montana capital' },
  { pattern: /\bButte\b/g, replacement: 'byoot', description: 'Montana city' },
  { pattern: /\bGlacier\b/gi, replacement: 'GLAY-sher', description: 'National park' },
  { pattern: /\bFlathead\b/gi, replacement: 'FLAT-head', description: 'Montana lake/valley' },

  // -------------------------------------------------------------------------
  // Arizona/New Mexico Place Names
  // -------------------------------------------------------------------------
  { pattern: /\bTucson\b/gi, replacement: 'TOO-sawn', description: 'Arizona city' },
  { pattern: /\bPrescott\b/g, replacement: 'PRESS-kit', description: 'Arizona city' },
  { pattern: /\bTempe\b/g, replacement: 'tem-PEE', description: 'Arizona city' },
  { pattern: /\bSedona\b/gi, replacement: 'seh-DOH-nuh', description: 'Arizona town' },
  { pattern: /\bSaguaro\b/gi, replacement: 'suh-WAHR-oh', description: 'Cactus/park' },
  { pattern: /\bMogollon\b/gi, replacement: 'MUH-gee-own', description: 'Arizona rim' },
  { pattern: /\bAlbuquerque\b/gi, replacement: 'AL-buh-kur-kee', description: 'New Mexico city' },
  { pattern: /\bSanta\s+Fe\b/gi, replacement: 'SAN-tuh fay', description: 'New Mexico capital' },
  { pattern: /\bTaos\b/gi, replacement: 'towse', description: 'New Mexico town' },
  { pattern: /\bRio\s+Grande\b/gi, replacement: 'REE-oh GRAND', description: 'River' },
  { pattern: /\bCarlsbad\b/gi, replacement: 'KARLZ-bad', description: 'New Mexico caves/city' },

  // -------------------------------------------------------------------------
  // Nevada Place Names
  // -------------------------------------------------------------------------
  { pattern: /\bNevada\b/gi, replacement: 'neh-VAD-uh', description: 'State (not neh-VAH-duh)' },
  { pattern: /\bReno\b/g, replacement: 'REE-no', description: 'Nevada city' },
  { pattern: /\bTahoe\b/gi, replacement: 'TAH-ho', description: 'Lake Tahoe' },
  { pattern: /\bTonopah\b/gi, replacement: 'TOH-nuh-pah', description: 'Nevada town' },
  { pattern: /\bEly\b/g, replacement: 'EE-lee', description: 'Nevada town' },

  // -------------------------------------------------------------------------
  // Utah Place Names
  // -------------------------------------------------------------------------
  { pattern: /\bTooele\b/gi, replacement: 'too-WILL-uh', description: 'Utah county/city' },
  { pattern: /\bDuchesne\b/gi, replacement: 'doo-SHAYN', description: 'Utah county/city' },
  { pattern: /\bMoab\b/g, replacement: 'MO-ab', description: 'Utah city near Arches' },
  { pattern: /\bUinta[h]?\b/gi, replacement: 'yoo-IN-tuh', description: 'Utah mountains/county' },
  { pattern: /\bWasatch\b/gi, replacement: 'WAH-satch', description: 'Utah mountain range' },
  { pattern: /\bHurricane\b/g, replacement: 'HER-ih-kun', description: 'Utah city pronunciation' },
  { pattern: /\bNephi\b/g, replacement: 'NEE-fye', description: 'Utah city' },
  { pattern: /\bLehi\b/g, replacement: 'LEE-high', description: 'Utah city' },
  { pattern: /\bKanab\b/gi, replacement: 'kuh-NAB', description: 'Utah city' },
  { pattern: /\bWeber\b/g, replacement: 'WEE-ber', description: 'Utah county/river' },
  { pattern: /\bEscalante\b/gi, replacement: 'es-kuh-LAN-tee', description: 'Utah town/canyon' },
  { pattern: /\bHeber\b/g, replacement: 'HEE-ber', description: 'Utah city' },
  { pattern: /\bPanguitch\b/gi, replacement: 'PAN-gwich', description: 'Utah town' },
  { pattern: /\bParowan\b/gi, replacement: 'puh-ROW-an', description: 'Utah town' },
  { pattern: /\bSanpete\b/gi, replacement: 'SAN-peet', description: 'Utah county' },
  { pattern: /\bSevier\b/gi, replacement: 'suh-VEER', description: 'Utah county/river' },
  { pattern: /\bTimpanogos\b/gi, replacement: 'tim-puh-NO-gus', description: 'Utah mountain' },
  { pattern: /\bBonneville\b/gi, replacement: 'BON-uh-vil', description: 'Utah salt flats' },
  { pattern: /\bZion\b/g, replacement: 'ZY-un', description: 'Utah national park' },

  // -------------------------------------------------------------------------
  // Japanese Terms Ferni might use (lived in Tokyo, mentor Tanaka-san)
  // -------------------------------------------------------------------------
  { pattern: /\bwabi-sabi\b/gi, replacement: 'wah-bee sah-bee', description: 'Japanese aesthetic' },
  { pattern: /\bikigai\b/gi, replacement: 'ee-kee-guy', description: 'Reason for being' },
  { pattern: /\bkaizen\b/gi, replacement: 'ky-zen', description: 'Continuous improvement' },
  { pattern: /\bshinrin-yoku\b/gi, replacement: 'shin-rin yoh-koo', description: 'Forest bathing' },
  { pattern: /\bkintsugi\b/gi, replacement: 'keen-tsoo-gee', description: 'Golden repair' },
  { pattern: /\bganbatte\b/gi, replacement: 'gahn-BAH-teh', description: 'Do your best' },
  { pattern: /\bshoganai\b/gi, replacement: 'sho-GAH-nai', description: 'It cannot be helped' },
  {
    pattern: /\bmono no aware\b/gi,
    replacement: 'MOH-no no ah-WAH-reh',
    description: 'Pathos of things',
  },
  { pattern: /\bomoiyari\b/gi, replacement: 'oh-MOY-yah-ree', description: 'Empathy/compassion' },
  {
    pattern: /\bnatsukashii\b/gi,
    replacement: 'nah-tsoo-KAH-shee',
    description: 'Nostalgic longing',
  },
  { pattern: /\bgaman\b/gi, replacement: 'GAH-mahn', description: 'Endurance/patience' },
  { pattern: /\bmottainai\b/gi, replacement: 'moht-TYE-nai', description: 'Waste nothing' },
  { pattern: /\byugen\b/gi, replacement: 'YOO-gen', description: 'Profound mystery/depth' },
  {
    pattern: /\bichi-?go ichi-?e\b/gi,
    replacement: 'ee-chee-go ee-chee-eh',
    description: 'One time one meeting',
  },
  { pattern: /\bsatori\b/gi, replacement: 'sah-TOH-ree', description: 'Enlightenment' },
  { pattern: /\bsensei\b/gi, replacement: 'SEN-say', description: 'Teacher/master' },
  {
    pattern: /\bsake\b(?=\s+(is|was|drink|cup|bottle|rice))/gi,
    replacement: 'SAH-keh',
    description: 'Japanese rice wine',
  },
  { pattern: /\bumami\b/gi, replacement: 'oo-MAH-mee', description: 'Fifth taste/savory' },
  { pattern: /\btsunami\b/gi, replacement: 'tsoo-NAH-mee', description: 'Tidal wave' },
  { pattern: /\bbonsai\b/gi, replacement: 'BON-sigh', description: 'Miniature tree art' },
  { pattern: /\btatami\b/gi, replacement: 'tah-TAH-mee', description: 'Japanese floor mat' },
  { pattern: /\bdojo\b/gi, replacement: 'DOH-joh', description: 'Training hall' },
  { pattern: /\bfuton\b/gi, replacement: 'FOO-tahn', description: 'Japanese bedding' },
  { pattern: /\bramen\b/gi, replacement: 'RAH-men', description: 'Japanese noodle soup' },
  { pattern: /\bmatcha\b/gi, replacement: 'MAH-chah', description: 'Green tea powder' },
  { pattern: /\bshoyu\b/gi, replacement: 'SHO-yoo', description: 'Soy sauce' },
  { pattern: /\bmiso\b/gi, replacement: 'MEE-so', description: 'Fermented soybean paste' },
  { pattern: /\bwasabi\b/gi, replacement: 'wah-SAH-bee', description: 'Japanese horseradish' },
  { pattern: /\bedamame\b/gi, replacement: 'ed-ah-MAH-meh', description: 'Soybean pods' },
  { pattern: /\bkombucha\b/gi, replacement: 'kom-BOO-chah', description: 'Fermented tea' },
  { pattern: /\btofu\b/gi, replacement: 'TOH-foo', description: 'Bean curd' },

  // -------------------------------------------------------------------------
  // Japanese Poets (Ferni's favorites)
  // -------------------------------------------------------------------------
  {
    pattern: /\bMitsuo\s+Aida\b/gi,
    replacement: 'Meet-soo-oh Ah-ee-dah',
    description: 'Japanese calligraphy poet',
  },
  { pattern: /\bAida\b(?=.*poet|.*calligraphy|.*wrote)/gi, replacement: 'Ah-ee-dah', description: 'Mitsuo Aida (in context)' },
  {
    pattern: /\bMatsuo\s+Bash[oō]\b/gi,
    replacement: 'Maht-soo-oh Bah-shoh',
    description: 'Haiku master',
  },
  { pattern: /\bBash[oō]\b/gi, replacement: 'Bah-shoh', description: 'Matsuo Bashō haiku master' },
  {
    pattern: /\bKobayashi\s+Issa\b/gi,
    replacement: 'Koh-bah-yah-shee Ee-sah',
    description: 'Haiku poet',
  },
  { pattern: /\bIssa\b(?=.*haiku|.*poet|.*wrote)/gi, replacement: 'Ee-sah', description: 'Kobayashi Issa (in context)' },
  { pattern: /\bRy[oō]kan\b/gi, replacement: 'Ryoh-kahn', description: 'Zen poet-monk' },
  { pattern: /\bChiyo-?ni\b/gi, replacement: 'Chee-yoh-nee', description: 'Female haiku poet' },
  { pattern: /\bMasaoka\s+Shiki\b/gi, replacement: 'Mah-sah-oh-kah Shee-kee', description: 'Modern haiku reformer' },
  { pattern: /\bShiki\b(?=.*haiku|.*poet)/gi, replacement: 'Shee-kee', description: 'Masaoka Shiki (in context)' },
  { pattern: /\bYosa\s+Buson\b/gi, replacement: 'Yoh-sah Boo-sohn', description: 'Haiku poet-painter' },
  { pattern: /\bBuson\b(?=.*haiku|.*poet)/gi, replacement: 'Boo-sohn', description: 'Yosa Buson (in context)' },

  // -------------------------------------------------------------------------
  // Japanese Poetry Terms
  // -------------------------------------------------------------------------
  { pattern: /\bhaiku\b/gi, replacement: 'HIGH-koo', description: 'Japanese 3-line poem' },
  { pattern: /\bhaikus\b/gi, replacement: 'HIGH-kooz', description: 'Multiple haiku' },
  { pattern: /\btanka\b/gi, replacement: 'TAHN-kah', description: 'Japanese 5-line poem' },
  { pattern: /\brenga\b/gi, replacement: 'REN-gah', description: 'Linked verse poetry' },
  { pattern: /\bsenry[uū]\b/gi, replacement: 'SEN-ryoo', description: 'Satirical haiku' },
  { pattern: /\bkigo\b/gi, replacement: 'KEE-goh', description: 'Seasonal reference word' },
  { pattern: /\bkireji\b/gi, replacement: 'kee-REH-jee', description: 'Cutting word in haiku' },

  // -------------------------------------------------------------------------
  // Additional Japanese Philosophy Terms
  // -------------------------------------------------------------------------
  { pattern: /\bwabi\b(?!\s*-?\s*sabi)/gi, replacement: 'WAH-bee', description: 'Rustic simplicity' },
  { pattern: /\bsabi\b(?!.*wabi)/gi, replacement: 'SAH-bee', description: 'Beauty of age' },
  {
    pattern: /\bTsumazuita tte ii janai ka\b/gi,
    replacement: 'Tsoo-mah-zoo-ee-tah teh ee jah-nai kah',
    description: 'Its okay to stumble',
  },
  {
    pattern: /\bSono mama de ii n da yo\b/gi,
    replacement: 'Soh-noh mah-mah deh ee n dah yoh',
    description: 'Youre fine just as you are',
  },
  {
    pattern: /\bShiawase wa itsumo jibun no kokoro ga kimeru\b/gi,
    replacement: 'Shee-ah-wah-seh wah ee-tsoo-moh jee-boon noh koh-koh-roh gah kee-meh-roo',
    description: 'Happiness is decided by your heart',
  },
  { pattern: /\bshinigami\b/gi, replacement: 'shee-nee-GAH-mee', description: 'Death spirit' },
  { pattern: /\bnengaj[oō]\b/gi, replacement: 'nen-GAH-joh', description: 'New Year card' },
  { pattern: /\bhanami\b/gi, replacement: 'hah-NAH-mee', description: 'Cherry blossom viewing' },
  { pattern: /\bsakura\b/gi, replacement: 'sah-KOO-rah', description: 'Cherry blossom' },
  {
    pattern: /\bIsshou benkyou isshou seishun\b/gi,
    replacement: 'ee-shoh ben-kyoh ee-shoh say-shoon',
    description: 'Lifetime learning lifetime youth',
  },
  { pattern: /\bkintsukuroi\b/gi, replacement: 'keen-tsoo-koo-ROY', description: 'Alternative for kintsugi' },
  {
    pattern: /\bichigo ichie\b/gi,
    replacement: 'ee-chee-go ee-chee-eh',
    description: 'One time one meeting',
  },
  { pattern: /\bma\b(?=\s*(space|silence|pause))/gi, replacement: 'mah', description: 'Negative space concept' },
  { pattern: /\bmusubi\b/gi, replacement: 'moo-SOO-bee', description: 'Interconnection' },
  { pattern: /\benso\b/gi, replacement: 'EN-soh', description: 'Zen circle' },
  { pattern: /\bensō\b/gi, replacement: 'EN-soh', description: 'Zen circle with macron' },

  // =========================================================================
  // MINDFULNESS & MEDITATION (Life Coaching Domain)
  // =========================================================================

  // -------------------------------------------------------------------------
  // Sanskrit Terms (Yoga & Meditation)
  // -------------------------------------------------------------------------
  { pattern: /\bnamaste\b/gi, replacement: 'nah-mah-STAY', description: 'Greeting/reverence' },
  { pattern: /\bprana\b/gi, replacement: 'PRAH-nuh', description: 'Life force/breath' },
  { pattern: /\bpranayama\b/gi, replacement: 'prah-nah-YAH-muh', description: 'Breath control' },
  { pattern: /\bchakra[s]?\b/gi, replacement: 'CHAH-kruh', description: 'Energy centers' },
  { pattern: /\bmantra[s]?\b/gi, replacement: 'MAN-truh', description: 'Sacred phrase' },
  { pattern: /\basana[s]?\b/gi, replacement: 'AH-suh-nuh', description: 'Yoga posture' },
  { pattern: /\bsavasana\b/gi, replacement: 'shah-VAH-suh-nuh', description: 'Corpse pose' },
  { pattern: /\bshavasana\b/gi, replacement: 'shah-VAH-suh-nuh', description: 'Corpse pose' },
  { pattern: /\bdharma\b/gi, replacement: 'DAR-muh', description: 'Sacred duty/teaching' },
  { pattern: /\bkarma\b/gi, replacement: 'KAR-muh', description: 'Action and consequence' },
  { pattern: /\bsangha\b/gi, replacement: 'SANG-guh', description: 'Spiritual community' },
  { pattern: /\bmudra[s]?\b/gi, replacement: 'MOO-druh', description: 'Hand gesture' },
  { pattern: /\bbandha[s]?\b/gi, replacement: 'BAN-duh', description: 'Energy lock' },
  { pattern: /\bnadi[s]?\b/gi, replacement: 'NAH-dee', description: 'Energy channel' },
  { pattern: /\bkundalini\b/gi, replacement: 'koon-duh-LEE-nee', description: 'Spiritual energy' },
  { pattern: /\bsattvic\b/gi, replacement: 'SAHT-vik', description: 'Pure/harmonious' },
  { pattern: /\btamasic\b/gi, replacement: 'tuh-MAH-sik', description: 'Inert/dull' },
  { pattern: /\brajasic\b/gi, replacement: 'RAH-juh-sik', description: 'Active/restless' },
  { pattern: /\bvinyasa\b/gi, replacement: 'vin-YAH-suh', description: 'Flow sequence' },
  { pattern: /\bsamadhi\b/gi, replacement: 'suh-MAH-dee', description: 'Deep absorption' },
  { pattern: /\bdhyana\b/gi, replacement: 'dee-AH-nuh', description: 'Meditation' },
  { pattern: /\bpratyahara\b/gi, replacement: 'prah-tyah-HAH-ruh', description: 'Sense withdrawal' },
  { pattern: /\bdharana\b/gi, replacement: 'dah-RAH-nuh', description: 'Concentration' },
  { pattern: /\bayurveda\b/gi, replacement: 'ah-yur-VAY-duh', description: 'Life science' },
  { pattern: /\bayurvedic\b/gi, replacement: 'ah-yur-VAY-dik', description: 'Of Ayurveda' },
  { pattern: /\bdosha[s]?\b/gi, replacement: 'DOH-shuh', description: 'Body constitution' },
  { pattern: /\bvata\b/gi, replacement: 'VAH-tuh', description: 'Air dosha' },
  { pattern: /\bpitta\b/gi, replacement: 'PIT-tuh', description: 'Fire dosha' },
  { pattern: /\bkapha\b/gi, replacement: 'KAH-fuh', description: 'Earth dosha' },
  { pattern: /\bsatsang\b/gi, replacement: 'saht-SANG', description: 'Spiritual gathering' },
  { pattern: /\bahimsa\b/gi, replacement: 'ah-HIM-sah', description: 'Non-violence' },
  { pattern: /\bsantosha\b/gi, replacement: 'san-TOH-shuh', description: 'Contentment' },
  { pattern: /\btapas\b/gi, replacement: 'TAH-pahs', description: 'Discipline/austerity' },
  { pattern: /\bsvadhyaya\b/gi, replacement: 'svahd-YAH-yuh', description: 'Self-study' },
  { pattern: /\bishvara\b/gi, replacement: 'ISH-var-uh', description: 'Supreme consciousness' },
  { pattern: /\bom\b/gi, replacement: 'ohm', description: 'Sacred syllable' },
  { pattern: /\baum\b/gi, replacement: 'ah-oom', description: 'Sacred syllable' },

  // -------------------------------------------------------------------------
  // Tibetan Buddhist Terms
  // -------------------------------------------------------------------------
  { pattern: /\bbardo\b/gi, replacement: 'BAR-doh', description: 'Intermediate state' },
  { pattern: /\btonglen\b/gi, replacement: 'tong-LEN', description: 'Giving and taking' },
  { pattern: /\bmetta\b/gi, replacement: 'MET-tah', description: 'Loving-kindness' },
  { pattern: /\bvipassana\b/gi, replacement: 'vih-PAH-suh-nuh', description: 'Insight meditation' },
  { pattern: /\bthich\b/gi, replacement: 'tick', description: 'Vietnamese Buddhist title' },
  { pattern: /\bdukk?ha\b/gi, replacement: 'DOO-kuh', description: 'Suffering/unsatisfactoriness' },
  { pattern: /\bnirvana\b/gi, replacement: 'nir-VAH-nuh', description: 'Liberation' },
  { pattern: /\bbodhisattva\b/gi, replacement: 'boh-dee-SAHT-vuh', description: 'Enlightenment being' },
  { pattern: /\bsangha\b/gi, replacement: 'SANG-guh', description: 'Community' },
  { pattern: /\btathagata\b/gi, replacement: 'tah-TAH-guh-tuh', description: 'Buddha epithet' },

  // -------------------------------------------------------------------------
  // Zen & East Asian Terms
  // -------------------------------------------------------------------------
  { pattern: /\bqi\b/gi, replacement: 'chee', description: 'Life energy (Chinese)' },
  { pattern: /\btai\s+chi\b/gi, replacement: 'tie chee', description: 'Martial art' },
  { pattern: /\bchi\b(?!\s*square)/gi, replacement: 'chee', description: 'Life energy' },
  { pattern: /\bqigong\b/gi, replacement: 'chee-GONG', description: 'Energy cultivation' },
  { pattern: /\bfeng\s+shui\b/gi, replacement: 'fung SHWAY', description: 'Spatial arrangement' },
  { pattern: /\byin\b(?!\s+and\s+yang)/gi, replacement: 'yin', description: 'Receptive principle' },
  { pattern: /\byang\b/gi, replacement: 'yahng', description: 'Active principle' },
  { pattern: /\byin\s+and\s+yang\b/gi, replacement: 'yin and yahng', description: 'Duality concept' },
  { pattern: /\bdao\b/gi, replacement: 'dow', description: 'The Way (Taoism)' },
  { pattern: /\btao\b/gi, replacement: 'dow', description: 'The Way (Taoism)' },
  { pattern: /\btaoism\b/gi, replacement: 'DOW-iz-um', description: 'Philosophy' },
  { pattern: /\bdaoism\b/gi, replacement: 'DOW-iz-um', description: 'Philosophy' },
  { pattern: /\bzen\b/gi, replacement: 'zen', description: 'Meditation Buddhism' },
  { pattern: /\bkoan\b/gi, replacement: 'KOH-ahn', description: 'Zen riddle' },
  { pattern: /\bzazen\b/gi, replacement: 'ZAH-zen', description: 'Sitting meditation' },
  { pattern: /\bkinhin\b/gi, replacement: 'KIN-hin', description: 'Walking meditation' },

  // =========================================================================
  // LIFE COACHING FRAMEWORKS & PSYCHOLOGY
  // =========================================================================

  // -------------------------------------------------------------------------
  // Coaching Models & Frameworks
  // -------------------------------------------------------------------------
  { pattern: /\bGROW\b/g, replacement: 'grow', description: 'Coaching model' },
  { pattern: /\bSMART\s+goals?\b/gi, replacement: 'smart goals', description: 'Goal framework' },
  { pattern: /\bOKRs?\b/g, replacement: 'O K Rs', description: 'Objectives Key Results' },
  { pattern: /\bKPIs?\b/g, replacement: 'K P Is', description: 'Key Performance Indicators' },
  { pattern: /\bICF\b/g, replacement: 'I C F', description: 'Intl Coach Federation' },

  // -------------------------------------------------------------------------
  // Psychological Terms & Assessments
  // -------------------------------------------------------------------------
  { pattern: /\bMBTI\b/g, replacement: 'M B T I', description: 'Myers-Briggs' },
  { pattern: /\bMyers[\s-]?Briggs\b/gi, replacement: 'MY-erz BRIGGS', description: 'Personality test' },
  { pattern: /\benneagram\b/gi, replacement: 'EN-ee-uh-gram', description: 'Personality system' },
  { pattern: /\bStrengthsFinder\b/gi, replacement: 'STRENGTHS-finder', description: 'Gallup assessment' },
  { pattern: /\bCliftonStrengths\b/gi, replacement: 'CLIFF-ton strengths', description: 'Gallup assessment' },
  { pattern: /\bDiSC\b/g, replacement: 'disk', description: 'Behavior assessment' },
  { pattern: /\beustress\b/gi, replacement: 'YOO-stress', description: 'Positive stress' },
  { pattern: /\bdistress\b/gi, replacement: 'dis-STRESS', description: 'Negative stress' },
  { pattern: /\bpsychoeducation\b/gi, replacement: 'sy-ko-ed-yoo-KAY-shun', description: 'Mental health education' },
  { pattern: /\bsomaticizing\b/gi, replacement: 'so-MAT-ih-sy-zing', description: 'Body manifesting' },
  { pattern: /\bsomatic\b/gi, replacement: 'so-MAT-ik', description: 'Body-based' },
  { pattern: /\bpolyvagal\b/gi, replacement: 'polly-VAY-gul', description: 'Vagus nerve theory' },
  { pattern: /\bamygdala\b/gi, replacement: 'uh-MIG-duh-luh', description: 'Brain emotion center' },
  { pattern: /\bhippocampus\b/gi, replacement: 'hip-oh-KAM-pus', description: 'Brain memory center' },
  { pattern: /\bprefrontal\b/gi, replacement: 'pree-FRON-tul', description: 'Brain region' },
  { pattern: /\bneuroplasticity\b/gi, replacement: 'noor-oh-plas-TIS-ih-tee', description: 'Brain adaptability' },
  { pattern: /\bneuroscience\b/gi, replacement: 'NOOR-oh-science', description: 'Brain science' },
  { pattern: /\bcortisol\b/gi, replacement: 'KOR-tih-sol', description: 'Stress hormone' },
  { pattern: /\bdopamine\b/gi, replacement: 'DOH-puh-meen', description: 'Reward chemical' },
  { pattern: /\bserotonin\b/gi, replacement: 'sair-uh-TOH-nin', description: 'Mood chemical' },
  { pattern: /\boxytocin\b/gi, replacement: 'awk-see-TOH-sin', description: 'Bonding hormone' },
  { pattern: /\bendorphins?\b/gi, replacement: 'en-DOR-fins', description: 'Feel-good chemicals' },

  // -------------------------------------------------------------------------
  // Behavior Change & Habits (Maya's domain)
  // -------------------------------------------------------------------------
  { pattern: /\bBJ\s+Fogg\b/gi, replacement: 'B J fog', description: 'Behavior scientist' },
  { pattern: /\bJames\s+Clear\b/gi, replacement: 'James Clear', description: 'Atomic Habits author' },
  { pattern: /\bGretchen\s+Rubin\b/gi, replacement: 'GRETCH-en ROO-bin', description: 'Four Tendencies author' },
  { pattern: /\bUpholder\b/g, replacement: 'up-HOLD-er', description: 'Four Tendencies type' },
  { pattern: /\bQuestioner\b/g, replacement: 'KWES-chun-er', description: 'Four Tendencies type' },
  { pattern: /\bObliger\b/g, replacement: 'oh-BLY-jer', description: 'Four Tendencies type' },
  { pattern: /\bRebel\b/g, replacement: 'REB-ul', description: 'Four Tendencies type' },
  { pattern: /\bhabit\s+loop\b/gi, replacement: 'HABIT loop', description: 'Cue-routine-reward' },
  { pattern: /\bkeystone\s+habit\b/gi, replacement: 'KEY-stone habit', description: 'High-impact habit' },

  // -------------------------------------------------------------------------
  // Stoic Philosophy Terms (Nayan's domain)
  // -------------------------------------------------------------------------
  { pattern: /\bdichotomy\s+of\s+control\b/gi, replacement: 'dy-KOT-uh-mee of control', description: 'Stoic principle' },
  { pattern: /\bpremeditatio\s+malorum\b/gi, replacement: 'pray-med-ih-TAH-tee-oh mah-LOR-um', description: 'Negative visualization' },
  { pattern: /\bamor\s+fati\b/gi, replacement: 'ah-MOR FAH-tee', description: 'Love of fate' },
  { pattern: /\bmemento\s+mori\b/gi, replacement: 'meh-MEN-toh MORE-ee', description: 'Remember death' },
  { pattern: /\bapatheia\b/gi, replacement: 'ah-puh-THAY-uh', description: 'Freedom from passion' },
  { pattern: /\bataraxia\b/gi, replacement: 'at-uh-RAK-see-uh', description: 'Tranquility' },
  { pattern: /\beudaimonia\b/gi, replacement: 'yoo-dy-MOH-nee-uh', description: 'Human flourishing' },
  { pattern: /\bvirtue\s+ethics\b/gi, replacement: 'VER-choo ethics', description: 'Moral philosophy' },
  { pattern: /\bSeneca\b/g, replacement: 'SEN-ih-kuh', description: 'Stoic philosopher' },
  { pattern: /\bEpictetus\b/gi, replacement: 'ep-ik-TEE-tus', description: 'Stoic philosopher' },
  { pattern: /\bMarcus\s+Aurelius\b/gi, replacement: 'MAR-kus aw-REE-lee-us', description: 'Stoic emperor' },
  { pattern: /\bMeditations\b/g, replacement: 'med-ih-TAY-shuns', description: 'Marcus Aurelius book' },

  // =========================================================================
  // COMMONLY MISPRONOUNCED WORDS
  // =========================================================================

  // -------------------------------------------------------------------------
  // Words TTS engines often struggle with
  // -------------------------------------------------------------------------
  { pattern: /\bawry\b/gi, replacement: 'uh-RYE', description: 'Not aww-ree' },
  { pattern: /\bcache\b/gi, replacement: 'cash', description: 'Not catch or cashay' },
  { pattern: /\bchasm\b/gi, replacement: 'KAZ-um', description: 'Not chaz-um' },
  { pattern: /\bdebut\b/gi, replacement: 'day-BYOO', description: 'Not dee-but' },
  { pattern: /\bdebris\b/gi, replacement: 'duh-BREE', description: 'Not DEB-ris' },
  { pattern: /\bdenouement\b/gi, replacement: 'day-noo-MAH', description: 'Story resolution' },
  { pattern: /\bdichotomy\b/gi, replacement: 'dy-KOT-uh-mee', description: 'Division in two' },
  { pattern: /\benigma\b/gi, replacement: 'ih-NIG-muh', description: 'Mystery' },
  { pattern: /\bepitome\b/gi, replacement: 'ih-PIT-uh-mee', description: 'Perfect example' },
  { pattern: /\bespresso\b/gi, replacement: 'es-PRESS-oh', description: 'Not expresso' },
  { pattern: /\bet\s+cetera\b/gi, replacement: 'et SET-er-uh', description: 'Not excetera' },
  { pattern: /\betc\.?\b/gi, replacement: 'et cetera', description: 'Abbreviation' },
  { pattern: /\bfaux\s+pas\b/gi, replacement: 'foh PAH', description: 'Social mistake' },
  { pattern: /\bgif\b/gi, replacement: 'gif', description: 'Image format (hard g)' },
  { pattern: /\bgist\b/gi, replacement: 'jist', description: 'Main point' },
  { pattern: /\bhyperbole\b/gi, replacement: 'hy-PER-buh-lee', description: 'Exaggeration' },
  { pattern: /\binaugural\b/gi, replacement: 'in-AW-gyer-ul', description: 'First/opening' },
  { pattern: /\blieutenant\b/gi, replacement: 'loo-TEN-unt', description: 'Military rank' },
  { pattern: /\bmischievous\b/gi, replacement: 'MIS-chih-vus', description: 'Not mis-CHEEV-ee-us' },
  { pattern: /\bniche\b/gi, replacement: 'neesh', description: 'Specialized market' },
  { pattern: /\bnuance\b/gi, replacement: 'NOO-ahns', description: 'Subtle difference' },
  { pattern: /\boften\b/gi, replacement: 'OFF-en', description: 'Silent T' },
  { pattern: /\bplethora\b/gi, replacement: 'PLETH-er-uh', description: 'Abundance' },
  { pattern: /\bprerogative\b/gi, replacement: 'prih-ROG-uh-tiv', description: 'Right/privilege' },
  { pattern: /\bprobably\b/gi, replacement: 'PROB-ab-lee', description: 'Not probly' },
  { pattern: /\bquinoa\b/gi, replacement: 'KEEN-wah', description: 'Grain' },
  { pattern: /\brendezvous\b/gi, replacement: 'RON-day-voo', description: 'Meeting' },
  { pattern: /\bsacrilegious\b/gi, replacement: 'sak-rih-LIJ-us', description: 'Not religious' },
  { pattern: /\bsegue\b/gi, replacement: 'SEG-way', description: 'Transition' },
  { pattern: /\bsherbet\b/gi, replacement: 'SHER-bit', description: 'Not sherbert' },
  { pattern: /\bsubtle\b/gi, replacement: 'SUTT-ul', description: 'Silent B' },
  { pattern: /\btriathlon\b/gi, replacement: 'try-ATH-lon', description: 'Not try-ath-uh-lon' },
  { pattern: /\bvicarious\b/gi, replacement: 'vy-KAIR-ee-us', description: 'Through another' },
  { pattern: /\bvulnerable\b/gi, replacement: 'VUL-ner-uh-bul', description: 'Not vunerable' },
  { pattern: /\bWorcestershire\b/gi, replacement: 'WOOS-ter-sher', description: 'Sauce name' },

  // -------------------------------------------------------------------------
  // Emotional/Relational Words (Life Coaching context)
  // -------------------------------------------------------------------------
  { pattern: /\bempathy\b/gi, replacement: 'EM-puh-thee', description: 'Understanding others' },
  { pattern: /\bresilience\b/gi, replacement: 'rih-ZIL-yuns', description: 'Bounce back ability' },
  { pattern: /\bresilient\b/gi, replacement: 'rih-ZIL-yunt', description: 'Able to recover' },
  { pattern: /\bvulnerability\b/gi, replacement: 'vul-ner-uh-BIL-ih-tee', description: 'Openness' },
  { pattern: /\bauthenticity\b/gi, replacement: 'aw-then-TIS-ih-tee', description: 'Being genuine' },
  { pattern: /\bauthentic\b/gi, replacement: 'aw-THEN-tik', description: 'Genuine' },
  { pattern: /\bintentionality\b/gi, replacement: 'in-ten-shun-AL-ih-tee', description: 'Purposefulness' },
  { pattern: /\bintentional\b/gi, replacement: 'in-TEN-shun-ul', description: 'On purpose' },
  { pattern: /\bholistic\b/gi, replacement: 'ho-LIS-tik', description: 'Whole-person' },
  { pattern: /\bgratitude\b/gi, replacement: 'GRAT-ih-tood', description: 'Thankfulness' },
  { pattern: /\bmindfulness\b/gi, replacement: 'MIND-ful-ness', description: 'Present awareness' },
  { pattern: /\bequanimity\b/gi, replacement: 'ee-kwuh-NIM-ih-tee', description: 'Mental calmness' },
  { pattern: /\bcompassion\b/gi, replacement: 'kum-PASH-un', description: 'Caring concern' },
  { pattern: /\bself-compassion\b/gi, replacement: 'self-kum-PASH-un', description: 'Self-kindness' },
  { pattern: /\bserendipity\b/gi, replacement: 'sair-en-DIP-ih-tee', description: 'Happy accident' },
  { pattern: /\bperseverance\b/gi, replacement: 'per-suh-VEER-uns', description: 'Persistence' },
  { pattern: /\bpersevere\b/gi, replacement: 'per-suh-VEER', description: 'Keep going' },
  { pattern: /\bintrospection\b/gi, replacement: 'in-truh-SPEK-shun', description: 'Self-examination' },
  { pattern: /\bintrospective\b/gi, replacement: 'in-truh-SPEK-tiv', description: 'Self-examining' },

  // -------------------------------------------------------------------------
  // Countries & Languages
  // -------------------------------------------------------------------------
  { pattern: /\bUS\b/g, replacement: 'U S', description: 'United States' },
  { pattern: /\bUSA\b/g, replacement: 'U S A', description: 'United States of America' },
  { pattern: /\bUK\b/g, replacement: 'U K', description: 'United Kingdom' },
  { pattern: /\bEU\b/g, replacement: 'E U', description: 'European Union' },
  { pattern: /\bUN\b/g, replacement: 'U N', description: 'United Nations' },

  // =========================================================================
  // MISCELLANEOUS
  // =========================================================================

  // -------------------------------------------------------------------------
  // Units & Measurements
  // -------------------------------------------------------------------------
  { pattern: /\b(\d+)\s*lbs?\b/gi, replacement: '$1 pounds', description: 'Pounds' },
  { pattern: /\b(\d+)\s*kgs?\b/gi, replacement: '$1 kilograms', description: 'Kilograms' },
  { pattern: /\b(\d+)\s*oz\b/gi, replacement: '$1 ounces', description: 'Ounces' },
  { pattern: /\b(\d+)\s*ft\b/gi, replacement: '$1 feet', description: 'Feet' },
  { pattern: /\b(\d+)\s*mi\b/gi, replacement: '$1 miles', description: 'Miles' },
  { pattern: /\b(\d+)\s*km\b/gi, replacement: '$1 kilometers', description: 'Kilometers' },

  // -------------------------------------------------------------------------
  // Medical & Health
  // -------------------------------------------------------------------------
  { pattern: /\bRx\b/g, replacement: 'prescription', description: 'Prescription' },
  { pattern: /\bOTC\b/g, replacement: 'over the counter', description: 'Over The Counter' },
  { pattern: /\bER\b/g, replacement: 'E R', description: 'Emergency Room' },
  { pattern: /\bICU\b/g, replacement: 'I C U', description: 'Intensive Care Unit' },
  { pattern: /\bMD\b/g, replacement: 'M D', description: 'Medical Doctor' },
  { pattern: /\bPhD\b/g, replacement: 'P H D', description: 'Doctor of Philosophy' },

  // -------------------------------------------------------------------------
  // COVID-related (still relevant)
  // -------------------------------------------------------------------------
  { pattern: /\bCOVID-19\b/gi, replacement: 'covid nineteen', description: 'COVID-19' },
  { pattern: /\bCOVID\b/gi, replacement: 'covid', description: 'COVID' },
  { pattern: /\bPCR\b/g, replacement: 'P C R', description: 'PCR test' },
];

// Legacy alias for backwards compatibility
export { FINANCIAL_PRONUNCIATIONS as PRONUNCIATIONS };

// =============================================================================
// EMOTION KEYWORDS
// Maps keywords to Cartesia-supported emotion values
// =============================================================================

export const EMOTION_KEYWORDS: Record<string, string> = {
  // -------------------------------------------------------------------------
  // Angry / Frustrated
  // -------------------------------------------------------------------------
  angry: 'angry',
  frustrated: 'angry',
  annoyed: 'angry',
  irritated: 'angry',
  furious: 'angry',
  outraged: 'angry',
  incensed: 'angry',
  'fed up': 'angry',
  indignant: 'angry',
  exasperated: 'angry',
  'will not': 'angry',
  'should not': 'angry',
  'this is wrong': 'angry',
  unacceptable: 'angry',
  stealing: 'angry',
  greed: 'angry',
  exploitation: 'angry',
  outrageous: 'angry',
  disgrace: 'angry',
  shameful: 'angry',
  'wall street': 'angry',
  'high fees': 'angry',
  'rip off': 'angry',
  'ripping off': 'angry',
  'taking advantage': 'angry',

  // -------------------------------------------------------------------------
  // Sad / Empathetic
  // -------------------------------------------------------------------------
  sad: 'sad',
  upset: 'sad',
  disappointed: 'sad',
  heartbroken: 'sad',
  devastated: 'sad',
  melancholy: 'sad',
  somber: 'sad',
  down: 'sad',
  depressed: 'sad',
  gloomy: 'sad',
  mournful: 'sad',
  grieving: 'sad',
  sorrowful: 'sad',
  despondent: 'sad',
  miserable: 'sad',
  sorry: 'sad',
  loss: 'sad',
  grief: 'sad',
  difficult: 'sad',
  hard: 'sad',
  struggle: 'sad',
  'i understand': 'sad',
  'i am sorry': 'sad',
  'my condolences': 'sad',
  'that is heavy': 'sad',
  'that hurts': 'sad',
  painful: 'sad',
  suffering: 'sad',
  heartbreak: 'sad',
  tragedy: 'sad',
  'passed away': 'sad',
  death: 'sad',
  died: 'sad',
  'hard times': 'sad',
  'tough times': 'sad',
  regret: 'sad',
  mistake: 'sad',
  failure: 'sad',
  'let you down': 'sad',
  worried: 'sad',
  anxious: 'sad',
  nervous: 'sad',
  apprehensive: 'sad',
  uneasy: 'sad',
  troubled: 'sad',
  stressed: 'sad',
  overwhelmed: 'sad',

  // -------------------------------------------------------------------------
  // Surprised / Excited
  // -------------------------------------------------------------------------
  surprised: 'surprised',
  shocked: 'surprised',
  amazed: 'surprised',
  astonished: 'surprised',
  stunned: 'surprised',
  startled: 'surprised',
  bewildered: 'surprised',
  incredulous: 'surprised',
  flabbergasted: 'surprised',
  'oh!': 'surprised',
  wow: 'surprised',
  'really?': 'surprised',
  'no way': 'surprised',
  'that is surprising': 'surprised',
  'can you believe': 'surprised',
  incredible: 'surprised',
  unbelievable: 'surprised',
  remarkable: 'surprised',
  extraordinary: 'surprised',
  'i had no idea': 'surprised',
  'never expected': 'surprised',
  astonishing: 'surprised',
  goodness: 'surprised',
  'my word': 'surprised',
  excited: 'surprised',
  thrilled: 'surprised',
  delighted: 'surprised',
  enthusiastic: 'surprised',
  elated: 'surprised',
  ecstatic: 'surprised',
  overjoyed: 'surprised',

  // -------------------------------------------------------------------------
  // Curious / Interested
  // -------------------------------------------------------------------------
  curious: 'curious',
  interested: 'curious',
  intrigued: 'curious',
  fascinated: 'curious',
  wondering: 'curious',
  questioning: 'curious',
  inquisitive: 'curious',
  pondering: 'curious',
  contemplating: 'curious',
  inquiring: 'curious',
  'tell me': 'curious',
  'what is': 'curious',
  'how do': 'curious',
  'why did': 'curious',
  'let me ask': 'curious',
  wonder: 'curious',
  'i wonder': 'curious',
  'what does': 'curious',
  'help me understand': 'curious',
  'what happened': 'curious',
  'how did': 'curious',
  interesting: 'curious',
  'tell me more': 'curious',
  'go on': 'curious',
  'and then': 'curious',
  concerned: 'curious',

  // -------------------------------------------------------------------------
  // Affectionate / Warm
  // -------------------------------------------------------------------------
  affectionate: 'affectionate',
  loving: 'affectionate',
  caring: 'affectionate',
  warm: 'affectionate',
  tender: 'affectionate',
  fond: 'affectionate',
  devoted: 'affectionate',
  adoring: 'affectionate',
  sympathetic: 'affectionate',
  compassionate: 'affectionate',
  empathetic: 'affectionate',
  supportive: 'affectionate',
  understanding: 'affectionate',
  happy: 'affectionate',
  joyful: 'affectionate',
  cheerful: 'affectionate',
  pleased: 'affectionate',
  grateful: 'affectionate',
  thankful: 'affectionate',
  content: 'affectionate',
  satisfied: 'affectionate',
  proud: 'affectionate',
  love: 'affectionate',
  care: 'affectionate',
  friend: 'affectionate',
  appreciate: 'affectionate',
  wonderful: 'affectionate',
  beautiful: 'affectionate',
  amazing: 'affectionate',
  fantastic: 'affectionate',
  'so proud': 'affectionate',
  'i believe': 'affectionate',
  'i care': 'affectionate',
  'my friend': 'affectionate',
  'dear friend': 'affectionate',
  warmth: 'affectionate',
  blessing: 'affectionate',
  blessed: 'affectionate',
  cherish: 'affectionate',
  treasure: 'affectionate',
  'means so much': 'affectionate',
  'close to my heart': 'affectionate',
  family: 'affectionate',
  grandkids: 'affectionate',
  grandchildren: 'affectionate',
  'my boy': 'affectionate',
  'my girl': 'affectionate',
  'young man': 'affectionate',
  'young lady': 'affectionate',

  // -------------------------------------------------------------------------
  // Confident / Assertive
  // -------------------------------------------------------------------------
  confident: 'confident',
  certain: 'confident',
  assured: 'confident',
  decisive: 'confident',
  determined: 'confident',
  resolute: 'confident',
  bold: 'confident',
  assertive: 'confident',

  // -------------------------------------------------------------------------
  // Calm / Thoughtful
  // -------------------------------------------------------------------------
  calm: 'calm',
  peaceful: 'calm',
  serene: 'calm',
  relaxed: 'calm',
  tranquil: 'calm',
  thoughtful: 'thoughtful',
  reflective: 'thoughtful',
  pensive: 'thoughtful',
  contemplative: 'thoughtful',
  meditative: 'thoughtful',
};

// =============================================================================
// PACING KEYWORDS
// =============================================================================

export const SLOW_PACE_KEYWORDS = [
  'important',
  'crucial',
  'essential',
  'fundamental',
  'key point',
  'remember',
  'never forget',
  'critical',
  'vital',
  'significant',
  'meaningful',
  'profound',
  'serious',
  'grave',
  'solemn',
  'thoughtful',
  'careful',
  'cautious',
  'deliberate',
  'methodical',
  'think',
  'consider',
  'reflect',
  'loss',
  'grief',
  'sorry',
  'understand',
  'empathy',
  'compassion',
  'wisdom',
  'philosophy',
  'challenging',
  'difficult',
];

export const FAST_PACE_KEYWORDS = [
  'quickly',
  'immediately',
  'right away',
  'hurry',
  'fast',
  'rapid',
  'swift',
  'urgent',
  'pressing',
  'time-sensitive',
  'exciting',
  'amazing',
  'incredible',
  'fantastic',
  'brilliant',
  'excited',
  'great',
  'wonderful',
  'yes!',
  'exactly',
  'absolutely',
  'definitely',
  'celebrate',
  'success',
  'win',
  'victory',
];

// =============================================================================
// VOLUME / EMPHASIS KEYWORDS
// =============================================================================

export const EMPHASIS_KEYWORDS = [
  'very',
  'really',
  'truly',
  'absolutely',
  'definitely',
  'certainly',
  'incredibly',
  'extremely',
  'especially',
  'particularly',
  'never',
  'always',
  'must',
  'essential',
  'critical',
  'vital',
  'important',
  'crucial',
  'this matters',
  'pay attention',
  'listen',
  'remember this',
];

export const WHISPER_KEYWORDS = [
  'secret',
  'between us',
  'confidentially',
  'quietly',
  'privately',
  'discreetly',
  'off the record',
  "don't tell anyone",
  'just between',
  'hush',
  'confidential',
  'let me tell you',
  'i want to share',
  'intimate',
  'personal',
  'private',
];

// =============================================================================
// VOCAL CUE PATTERNS
// =============================================================================

export const LAUGHTER_PATTERNS = [
  /\bhaha\b/gi,
  /\bhehe\b/gi,
  /\blol\b/gi,
  /\brofl\b/gi,
  /\b(laughs?|laughing)\b/gi,
  /\bchuckle/gi,
  /\bgiggle/gi,
  /\b(that's|it's)\s+(hilarious|funny|amusing|ridiculous|absurd)\b/gi,
  /\b(can't|couldn't)\s+stop\s+laughing\b/gi,
  /\b(made|makes)\s+me\s+laugh\b/gi,
  /\b(cracking|cracks)\s+(me\s+)?up\b/gi,
  /\bhilarious(ly)?\b/gi,
  /\bfunny\s+(thing|part|story|enough)\b/gi,
  /\b(burst|bursting)\s+(out|into)\s+laugh/gi,
  /you know/i,
  /that is funny/i,
  /ha ha/i,
  /heh/i,
  /that is great/i,
  /that is wonderful/i,
  /that is amazing/i,
  /good one/i,
  /nice one/i,
  /i love that/i,
  /that reminds me/i,
  /oh boy/i,
  /oh my/i,
  /isn't that something/i,
  /that is something/i,
  /imagine that/i,
];

export const LAUGHTER_INVITATIONS = [
  'ha',
  'heh',
  'haha',
  'oh that reminds me of a funny...',
  'you know what makes me chuckle...',
  "I can't help but smile...",
];

export const SIGH_PATTERNS = [
  /\*sighs?\*/gi,
  /\b(sighs?|sighing)\b/gi,
  /\b(takes?\s+a\s+deep\s+breath)\b/gi,
  /\b(exhales?|exhaling)\b/gi,
  /\balas\b/gi,
  /\boh\s+well\b/gi,
  /\bah\s+well\b/gi,
  /that is heavy/i,
  /i understand/i,
  /that hurts/i,
  /difficult/i,
  /hard to hear/i,
];

export const DISFLUENCY_PATTERNS = [
  /\b(um|uh|er|ah|like|you know|i mean|sort of|kind of|basically|actually)\b/gi,
];

export const REPETITION_PATTERNS = [
  /\b(\w+)\s+\1\b/gi, // Immediate word repetition
];

export const SARCASTIC_PATTERNS = [
  /\b(oh\s+)?sure(ly)?[,.]?\b/gi,
  /\byeah\s+right\b/gi,
  /\boh\s+(great|wonderful|fantastic|brilliant)\b/gi,
  /\bwhat\s+a\s+(surprise|shock)\b/gi,
];

// =============================================================================
// SPEECH FLOW PATTERNS
// =============================================================================

export const THINKING_SOUNDS = [
  /\b(well|hmm|ah|oh|um|uh|you know|i mean|actually|let me think|hmm)\b/gi,
];

export const REFLECTION_PHRASES = [
  /\b(you see|the thing is|here's the thing|i think|i believe|in my view|from my perspective)\b/gi,
  /\b(what i've found|what i've learned|over the years|in my experience)\b/gi,
  /\b(let me put it this way|to be honest|frankly|truth be told)\b/gi,
  /\b(let me think|let me see|hmm|well|you know|i mean|actually|i suppose|i guess)\b/gi,
  /\b(that is interesting|that is a good question|that makes me think|i wonder)\b/gi,
  /\b(now that i think about it|come to think of it|on reflection|thinking about it)\b/gi,
  /\b(you know what|here is the thing|the thing is|what i mean is)\b/gi,
];

export const CONTEMPLATIVE_PAUSE_PHRASES = [
  /\b(now|so|but here's the thing|and yet|however|still|nonetheless)\b/gi,
  /\b(interestingly|curiously|remarkably|surprisingly|notably)\b/gi,
  /\b(i think|i believe|i feel|i know|i see|i understand|i realize)\b/gi,
  /\b(that is|which means|in other words|to put it another way)\b/gi,
  /\b(remember|think about|consider|imagine|picture this)\b/gi,
];

export const TRANSITION_PHRASES = [
  /\b(first of all|secondly|thirdly|finally|in conclusion|to summarize)\b/gi,
  /\b(on the other hand|alternatively|conversely|in contrast|meanwhile)\b/gi,
  /\b(but|however|although|though|meanwhile|furthermore|moreover|additionally|also|plus)\b/gi,
  /\b(so|then|now|well|okay|alright|right|see|look|listen)\b/gi,
];

export const BREATH_POINTS = [
  /\.\s+(?=[A-Z])/g, // After periods before new sentences
  /\?\s+(?=[A-Z])/g, // After questions
  /!\s+(?=[A-Z])/g, // After exclamations
  /\b(after all|in fact|as a result|for example|that is|which means)\b/gi,
  /\b(i think|i believe|i feel|i know|i see|i understand)\b/gi,
];

export const CONTRASTIVE_PATTERNS = [
  /\b(but|however|although|yet|still|nevertheless|nonetheless|on the other hand)\b/gi,
  /\b(not\s+\w+,\s*but\s+\w+)/gi,
  /\b(rather than|instead of|as opposed to)\b/gi,
];

export const PARENTHETICAL_PATTERNS = [/\([^)]+\)/g, /—[^—]+—/g, /–[^–]+–/g];

export const LIST_PATTERNS = [/\b(\d+[\.\)]\s+[^.!?]+)/g, /\b([•·-]\s+[^.!?]+)/g];

export const ACRONYM_PATTERN = /\b[A-Z]{2,5}\b/g;

export const NUMBER_PATTERNS = [
  { pattern: /\b(\d{1,3}),(\d{3})\b/g, handler: 'largeNumber' },
  { pattern: /\b\d+\.\d+%\b/g, handler: 'percentage' },
  { pattern: /\$[\d,.]+/g, handler: 'currency' },
];

// =============================================================================
// STAGE DIRECTION KEYWORDS (for sanitization)
// Comprehensive list of non-verbal actions that LLMs might generate
// =============================================================================

export const STAGE_DIRECTION_KEYWORDS = [
  // =========================================================================
  // BREATHING & PHYSICAL SOUNDS
  // =========================================================================
  'sigh',
  'sighing',
  'breath',
  'exhale',
  'exhaling',
  'inhale',
  'inhaling',
  'breathing',
  'gasp',
  'gasping',
  'yawn',
  'yawning',
  'cough',
  'coughing',
  'sniff',
  'sniffing',
  'sob',
  'sobbing',
  'whimper',
  'whimpering',
  'groan',
  'groaning',
  'grunt',
  'grunting',
  'hum',
  'humming',
  'murmur',
  'murmuring',
  'whisper',
  'whispering',
  'clear throat',
  'clears throat',
  'clearing throat',

  // =========================================================================
  // FACIAL EXPRESSIONS
  // =========================================================================
  'smile',
  'smiles',
  'smiling',
  'grin',
  'grins',
  'grinning',
  'frown',
  'frowns',
  'frowning',
  'wink',
  'winks',
  'winking',
  'blink',
  'blinks',
  'blinking',
  'smirk',
  'smirks',
  'smirking',
  'beam',
  'beams',
  'beaming',
  'grimace',
  'grimaces',
  'grimacing',
  'pout',
  'pouts',
  'pouting',
  'scowl',
  'scowls',
  'scowling',
  'squint',
  'squints',
  'squinting',
  'raises eyebrow',
  'eyebrow raise',
  'rolls eyes',
  'eye roll',

  // =========================================================================
  // HEAD & BODY MOVEMENTS
  // =========================================================================
  'nod',
  'nods',
  'nodding',
  'shake head',
  'shakes head',
  'shaking head',
  'tilt',
  'tilts',
  'tilting',
  'lean',
  'leans',
  'leaning',
  'shift',
  'shifts',
  'shifting',
  'settle',
  'settles',
  'settling',
  'shrug',
  'shrugs',
  'shrugging',
  'gesture',
  'gestures',
  'gesturing',
  'point',
  'points',
  'pointing',
  'wave',
  'waves',
  'waving',
  'stretch',
  'stretches',
  'stretching',
  'cross arms',
  'crosses arms',
  'crossing arms',
  'uncross',
  'uncrosses',
  'clap',
  'claps',
  'clapping',
  'applaud',
  'applauds',
  'applauding',
  'bounce',
  'bounces',
  'bouncing',
  'jump',
  'jumps',
  'jumping',
  'sniff',
  'sniffs',
  'sniffling',
  'teary',
  'emotional',
  'emotionally',
  'typing',
  'typing sounds',
  'looks up',
  'look up',
  'eyes widen',
  'eyes light up',
  'rapid-fire',
  'rapid fire',
  'accent intensifies',
  'intensifies',
  'efficient',
  'efficiently',
  'excitedly',
  'delighted',
  'delightedly',
  'enthusiastically',
  'contemplative',
  'contemplatively',
  'rapid',

  // =========================================================================
  // MENTAL ACTIONS (should not be spoken)
  // =========================================================================
  'pause',
  'pauses',
  'pausing',
  'think',
  'thinks',
  'thinking',
  'consider',
  'considers',
  'considering',
  'ponder',
  'ponders',
  'pondering',
  'reflect',
  'reflects',
  'reflecting',
  'hesitate',
  'hesitates',
  'hesitating',
  'focus',
  'focuses',
  'focusing',

  // =========================================================================
  // MANNER/TONE ADVERBS (stage directions when standalone)
  // =========================================================================
  'warm',
  'warmly',
  'steady',
  'steadily',
  'gentle',
  'gently',
  'soft',
  'softly',
  'quiet',
  'quietly',
  'tender',
  'tenderly',
  'firm',
  'firmly',
  'calm',
  'calmly',
  'serious',
  'seriously',
  'sincere',
  'sincerely',
  'earnest',
  'earnestly',
  'careful',
  'carefully',
  'kind',
  'kindly',
  'patient',
  'patiently',
  'eager',
  'eagerly',
  'bright',
  'brightly',
  'light',
  'lightly',
  'heavy',
  'heavily',
  'slow',
  'slowly',
  'quick',
  'quickly',

  // =========================================================================
  // TONE/ATTITUDE DESCRIPTORS
  // =========================================================================
  'teasing',
  'teasingly',
  'playful',
  'playfully',
  'mischievous',
  'mischievously',
  'knowing',
  'knowingly',
  'affectionate',
  'affectionately',
  'sarcastic',
  'sarcastically',
  'wry',
  'wryly',
  'dry',
  'dryly',
  'ironic',
  'ironically',
  'deadpan',
  'mock',
  'mocking',
  'mockingly',
  'tongue-in-cheek',
  'matter-of-fact',
  'matter-of-factly',
  'amused',
  'amusedly',
  'rueful',
  'ruefully',
  'sheepish',
  'sheepishly',
  'apologetic',
  'apologetically',
  'defensive',
  'defensively',
  'dismissive',
  'dismissively',
  'encouraging',
  'encouragingly',
  'reassuring',
  'reassuringly',
  'conspiratorial',
  'conspiratorially',
  'dramatic',
  'dramatically',
  'theatrical',
  'theatrically',

  // =========================================================================
  // EMOTIONS AS STAGE DIRECTIONS
  // =========================================================================
  'sympathetic',
  'sympathetically',
  'empathetic',
  'empathetically',
  'concerned',
  'concernedly',
  'curious',
  'curiously',
  'thoughtful',
  'thoughtfully',
  'wistful',
  'wistfully',
  'nostalgic',
  'nostalgically',
  'sad',
  'sadly',
  'happy',
  'happily',
  'excited',
  'excitedly',
  'nervous',
  'nervously',
  'anxious',
  'anxiously',
  'relieved',
  'with relief',

  // =========================================================================
  // ENERGY/STATE DESCRIPTORS
  // =========================================================================
  'perk',
  'perks',
  'perking',
  'energy',
  'relief',
  'visible',
  'visibly',
  'audible',
  'audibly',
  'suddenly',
  'abruptly',
  'finally',

  // =========================================================================
  // VOICE DESCRIPTIONS (meta-commentary on speech)
  // =========================================================================
  'voice softens',
  'voice drops',
  'voice rises',
  'voice cracks',
  'voice breaks',
  'voice trails',
  'trails off',
  'voice lowers',
  'voice raises',
  'clears voice',
  'lowers voice',
  'raises voice',

  // =========================================================================
  // MISC STAGE DIRECTION PHRASES
  // =========================================================================
  "chef's kiss",
  'taking a breath',
  'takes a breath',
  'deep breath',
  'long pause',
  'brief pause',
  'short pause',
  'moment of silence',
  'beat',
  'a beat',
  'present',
  'presence',
  'attention',
];
