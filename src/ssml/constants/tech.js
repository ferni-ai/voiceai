/**
 * Technology & Digital Pronunciations
 *
 * @module ssml/constants/tech
 */
export const TECH_PRONUNCIATIONS = [
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
];
//# sourceMappingURL=tech.js.map