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
  // Japanese Terms Ferni might use
  // -------------------------------------------------------------------------
  { pattern: /\bwabi-sabi\b/gi, replacement: 'wah-bee sah-bee', description: 'Japanese aesthetic' },
  { pattern: /\bikigai\b/gi, replacement: 'ee-kee-guy', description: 'Reason for being' },
  { pattern: /\bkaizen\b/gi, replacement: 'ky-zen', description: 'Continuous improvement' },
  { pattern: /\bshinrin-yoku\b/gi, replacement: 'shin-rin yoh-koo', description: 'Forest bathing' },
  { pattern: /\bkintsugi\b/gi, replacement: 'keen-tsoo-gee', description: 'Golden repair' },

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
