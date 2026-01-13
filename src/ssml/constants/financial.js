/**
 * Financial Pronunciation Dictionary
 * Maps financial terms to their phonetic "sounds-like" pronunciations
 *
 * @module ssml/constants/financial
 */
export const FINANCIAL_PRONUNCIATIONS = [
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
];
//# sourceMappingURL=financial.js.map