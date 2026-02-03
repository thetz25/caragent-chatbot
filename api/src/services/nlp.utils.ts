/**
 * Natural Language Processing utilities for better query understanding
 */

// Common stop words and filler words to remove
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'of', 'for', 'in', 'on', 'at', 'to', 'from', 'by', 'with', 'about',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'her', 'its', 'our', 'their',
    'this', 'that', 'these', 'those', 'here', 'there',
    'what', 'which', 'who', 'when', 'where', 'why', 'how',
    'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'now', 'then', 'also', 'get', 'got', 'give', 'gave', 'show', 'me',
    'tell', 'know', 'see', 'look', 'want', 'would', 'could', 'should', 'may', 'might',
    'can', 'will', 'shall', 'please', 'thanks', 'thank', 'yes', 'yeah', 'yep', 'ok', 'okay'
]);

// Words that indicate photo/image requests
const PHOTO_INDICATORS = [
    'photo', 'photos', 'picture', 'pictures', 'image', 'images', 'pic', 'pics',
    'snapshot', 'snapshots', 'gallery', 'shot', 'shots', 'visual', 'view'
];

// Words that indicate spec requests
const SPEC_INDICATORS = [
    'spec', 'specs', 'specification', 'specifications', 'feature', 'features',
    'detail', 'details', 'info', 'information', 'stats', 'stat', 'technical'
];

// Words that indicate quote/price requests
const QUOTE_INDICATORS = [
    'quote', 'quotes', 'quotation', 'price', 'pricing', 'cost', 'amount', 'fee',
    'payment', 'pay', 'how much', 'how much is', 'what is the price', 'worth',
    'estimate', 'budget', 'financing', 'installment', 'monthly', 'down payment'
];

/**
 * Clean and normalize user query by removing stop words and filler words
 * @param query - Raw user input
 * @returns Cleaned query ready for searching
 */
export function cleanQuery(query: string): string {
    if (!query || typeof query !== 'string') return '';
    
    // Convert to lowercase
    let cleaned = query.toLowerCase().trim();
    
    // Remove punctuation except alphanumeric and spaces
    cleaned = cleaned.replace(/[^a-z0-9\s]/g, ' ');
    
    // Split into words
    const words = cleaned.split(/\s+/).filter(word => word.length > 0);
    
    // Remove stop words
    const meaningfulWords = words.filter(word => !STOP_WORDS.has(word));
    
    // Join back
    return meaningfulWords.join(' ').trim();
}

/**
 * Extract search query from photo request
 * Handles: "photo of Montero", "show me pictures of Xpander", "images"
 * @param message - Full user message
 * @returns Cleaned search query
 */
export function extractPhotoQuery(message: string): string {
    let query = message.toLowerCase();
    
    // Remove photo indicator words
    PHOTO_INDICATORS.forEach(indicator => {
        const regex = new RegExp(indicator, 'gi');
        query = query.replace(regex, ' ');
    });
    
    // Clean the remaining text
    return cleanQuery(query);
}

/**
 * Extract search query from spec request
 * Handles: "specs of Xpander", "what are the features of Montero"
 * @param message - Full user message
 * @returns Cleaned search query
 */
export function extractSpecQuery(message: string): string {
    let query = message.toLowerCase();
    
    // Remove spec indicator words
    SPEC_INDICATORS.forEach(indicator => {
        const regex = new RegExp(indicator, 'gi');
        query = query.replace(regex, ' ');
    });
    
    // Clean the remaining text
    return cleanQuery(query);
}

/**
 * Extract search query from quote request
 * Handles: "quote for Xpander", "how much is Montero", "price of Strada"
 * @param message - Full user message
 * @returns Cleaned search query
 */
export function extractQuoteQuery(message: string): string {
    let query = message.toLowerCase();
    
    // Remove quote/price indicator words
    QUOTE_INDICATORS.forEach(indicator => {
        const regex = new RegExp(indicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        query = query.replace(regex, ' ');
    });
    
    // Clean the remaining text
    return cleanQuery(query);
}

/**
 * Check if message is asking for photos
 * @param message - User message
 * @returns true if photo request
 */
export function isPhotoRequest(message: string): boolean {
    const lower = message.toLowerCase();
    return PHOTO_INDICATORS.some(indicator => lower.includes(indicator));
}

/**
 * Check if message is asking for specs
 * @param message - User message
 * @returns true if spec request
 */
export function isSpecRequest(message: string): boolean {
    const lower = message.toLowerCase();
    return SPEC_INDICATORS.some(indicator => lower.includes(indicator));
}

/**
 * Check if message is asking for quote/price
 * @param message - User message
 * @returns true if quote request
 */
export function isQuoteRequest(message: string): boolean {
    const lower = message.toLowerCase();
    return QUOTE_INDICATORS.some(indicator => lower.includes(indicator));
}

/**
 * Calculate string similarity using Levenshtein distance
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Similarity score (0-1, where 1 is exact match)
 */
export function calculateSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0 && len2 === 0) return 1;
    if (len1 === 0 || len2 === 0) return 0;
    
    const matrix: number[][] = [];
    
    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }
    
    // Fill matrix
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }
    
    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    
    return 1 - distance / maxLen;
}

/**
 * Find best matching string from a list
 * @param query - Search query
 * @param candidates - List of candidate strings
 * @param threshold - Minimum similarity threshold (0-1)
 * @returns Best match or null if none found
 */
export function findBestMatch(
    query: string,
    candidates: string[],
    threshold: number = 0.6
): string | null {
    if (!query || candidates.length === 0) return null;
    
    let bestMatch: string | null = null;
    let bestScore = 0;
    
    const cleanedQuery = cleanQuery(query);
    
    for (const candidate of candidates) {
        const score = calculateSimilarity(cleanedQuery, candidate.toLowerCase());
        if (score > bestScore && score >= threshold) {
            bestScore = score;
            bestMatch = candidate;
        }
    }
    
    return bestMatch;
}

/**
 * Generate conversational error message with suggestions
 * @param query - User's search query
 * @param availableOptions - List of available options to suggest
 * @param context - Type of search (model, variant, etc.)
 * @returns Conversational error message
 */
export function generateNotFoundMessage(
    query: string,
    availableOptions: string[],
    context: string = 'item'
): string {
    // Find closest matches for suggestions
    const suggestions = availableOptions
        .map(option => ({
            option,
            score: calculateSimilarity(query.toLowerCase(), option.toLowerCase())
        }))
        .filter(item => item.score > 0.4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(item => item.option);
    
    let message = `I couldn't find a ${context} matching "${query}". `;
    
    if (suggestions.length > 0) {
        message += `Did you mean:\n`;
        suggestions.forEach((suggestion, i) => {
            message += `${i + 1}. ${suggestion}\n`;
        });
        message += `\nOr type "models" to see all available cars.`;
    } else {
        message += `\n\nType "models" to see our complete lineup, or ask me anything about Mitsubishi vehicles!`;
    }
    
    return message;
}
