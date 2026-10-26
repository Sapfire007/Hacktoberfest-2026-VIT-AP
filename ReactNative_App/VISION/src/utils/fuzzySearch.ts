/**
 * Fuzzy Search Utility with Vector Similarity
 * 
 * Implements fuzzy string matching for faculty name search with:
 * - Levenshtein distance (edit distance)
 * - N-gram similarity (character sequence matching)
 * - Phonetic matching (soundex-like algorithm)
 * - Token-based matching (handles word reordering)
 * 
 * Handles common search issues:
 * - Typos and spelling mistakes
 * - Missing/extra characters
 * - Word order differences
 * - Partial name matches
 * - Abbreviations and initials
 */

/**
 * Calculate Levenshtein distance between two strings
 * Measures minimum number of single-character edits (insertions, deletions, substitutions)
 * 
 * Example:
 *   levenshteinDistance("kitten", "sitting") = 3
 *   - k → s (substitution)
 *   - e → i (substitution)
 *   - + g (insertion)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  const len1 = s1.length;
  const len2 = s2.length;
  
  // Create matrix
  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));
  
  // Initialize first row and column
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Calculate similarity score based on Levenshtein distance
 * Returns 0-1, where 1 is perfect match
 */
function levenshteinSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1;
  return 1 - distance / maxLength;
}

/**
 * Generate n-grams from a string
 * N-grams are continuous sequences of n characters
 * 
 * Example:
 *   getNGrams("hello", 2) = ["he", "el", "ll", "lo"]
 */
function getNGrams(str: string, n: number): string[] {
  const s = str.toLowerCase().replace(/\s+/g, '');
  const grams: string[] = [];
  for (let i = 0; i <= s.length - n; i++) {
    grams.push(s.slice(i, i + n));
  }
  return grams;
}

/**
 * Calculate n-gram similarity between two strings
 * Measures character sequence overlap
 */
function nGramSimilarity(str1: string, str2: string, n: number = 2): number {
  const grams1 = getNGrams(str1, n);
  const grams2 = getNGrams(str2, n);
  
  if (grams1.length === 0 && grams2.length === 0) return 1;
  if (grams1.length === 0 || grams2.length === 0) return 0;
  
  const set1 = new Set(grams1);
  const set2 = new Set(grams2);
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Simple soundex-like phonetic encoding
 * Maps similar-sounding letters to same code
 */
function soundex(str: string): string {
  const s = str.toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return '';
  
  const firstLetter = s[0];
  
  // Mapping similar-sounding consonants
  let code = s
    .slice(1)
    .replace(/[bfpv]/g, '1')
    .replace(/[cgjkqsxz]/g, '2')
    .replace(/[dt]/g, '3')
    .replace(/[l]/g, '4')
    .replace(/[mn]/g, '5')
    .replace(/[r]/g, '6')
    .replace(/[aeiouyhw]/g, '0');
  
  // Remove consecutive duplicates and zeros
  code = code.replace(/(\d)\1+/g, '$1').replace(/0/g, '');
  
  // Return first letter + first 3 digits of code
  return (firstLetter + code + '000').slice(0, 4);
}

/**
 * Calculate phonetic similarity
 */
function phoneticSimilarity(str1: string, str2: string): number {
  const code1 = soundex(str1);
  const code2 = soundex(str2);
  if (code1 === code2) return 1;
  return levenshteinSimilarity(code1, code2);
}

/**
 * Tokenize string into words
 */
function tokenize(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Calculate token-based similarity
 * Handles word reordering (e.g., "Dr. Kumar Verma" vs "Verma Kumar")
 */
function tokenSimilarity(str1: string, str2: string): number {
  const tokens1 = tokenize(str1);
  const tokens2 = tokenize(str2);
  
  if (tokens1.length === 0 && tokens2.length === 0) return 1;
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  
  let matchCount = 0;
  const used = new Set<number>();
  
  for (const t1 of tokens1) {
    let bestMatch = 0;
    let bestIdx = -1;
    
    tokens2.forEach((t2, idx) => {
      if (used.has(idx)) return;
      const sim = levenshteinSimilarity(t1, t2);
      if (sim > bestMatch) {
        bestMatch = sim;
        bestIdx = idx;
      }
    });
    
    if (bestMatch > 0.6) {
      matchCount += bestMatch;
      if (bestIdx >= 0) used.add(bestIdx);
    }
  }
  
  return matchCount / Math.max(tokens1.length, tokens2.length);
}

/**
 * Check if string starts with query (prefix match)
 * Useful for autocomplete-style searches
 */
function prefixMatch(str: string, query: string): boolean {
  return str.toLowerCase().startsWith(query.toLowerCase());
}

/**
 * Check if any token starts with query
 */
function tokenPrefixMatch(str: string, query: string): boolean {
  const tokens = tokenize(str);
  const q = query.toLowerCase();
  return tokens.some(token => token.startsWith(q));
}

/**
 * Calculate comprehensive fuzzy match score
 * Combines multiple similarity metrics with weighting
 * 
 * @param target - The string to match against (e.g., faculty name)
 * @param query - The search query
 * @returns Score from 0-1, where 1 is perfect match
 */
export function fuzzyMatchScore(target: string, query: string): number {
  if (!target || !query) return 0;
  
  const t = target.toLowerCase();
  const q = query.toLowerCase();
  
  // Exact match
  if (t === q) return 1.0;
  
  // Contains match (substring)
  if (t.includes(q)) return 0.95;
  
  // Prefix match bonus
  let score = 0;
  if (prefixMatch(target, query)) score += 0.3;
  if (tokenPrefixMatch(target, query)) score += 0.2;
  
  // Weighted combination of similarity metrics
  const levenshtein = levenshteinSimilarity(target, query) * 0.25;
  const ngram = nGramSimilarity(target, query, 2) * 0.25;
  const phonetic = phoneticSimilarity(target, query) * 0.15;
  const token = tokenSimilarity(target, query) * 0.35;
  
  score += levenshtein + ngram + phonetic + token;
  
  // Normalize to 0-1 range
  return Math.min(score, 1.0);
}

/**
 * Search interface for any searchable item
 */
export interface SearchableItem {
  id: string;
  name: string;
  [key: string]: any;
}

/**
 * Search result with relevance score
 */
export interface SearchResult<T extends SearchableItem> {
  item: T;
  score: number;
  matchedField: string;
}

/**
 * Fuzzy search options
 */
export interface FuzzySearchOptions {
  /**
   * Fields to search in (e.g., ['name', 'department', 'email'])
   */
  searchFields?: string[];
  
  /**
   * Minimum score threshold (0-1)
   * Results below this score are filtered out
   */
  threshold?: number;
  
  /**
   * Maximum number of results to return
   */
  limit?: number;
  
  /**
   * Weight multipliers for each search field
   * Higher weight = more important field
   */
  fieldWeights?: Record<string, number>;
}

/**
 * Perform fuzzy search on array of items
 * 
 * @example
 * const results = fuzzySearch(
 *   faculty,
 *   'Dr Verma',
 *   {
 *     searchFields: ['name', 'department'],
 *     threshold: 0.3,
 *     limit: 10,
 *     fieldWeights: { name: 1.5, department: 0.5 }
 *   }
 * );
 */
export function fuzzySearch<T extends SearchableItem>(
  items: T[],
  query: string,
  options: FuzzySearchOptions = {}
): SearchResult<T>[] {
  const {
    searchFields = ['name'],
    threshold = 0.2,
    limit = 50,
    fieldWeights = {},
  } = options;
  
  if (!query || query.trim() === '') {
    return items.map(item => ({
      item,
      score: 1,
      matchedField: searchFields[0],
    }));
  }
  
  const results: SearchResult<T>[] = [];
  
  for (const item of items) {
    let bestScore = 0;
    let bestField = searchFields[0];
    
    for (const field of searchFields) {
      const value = item[field];
      if (!value || typeof value !== 'string') continue;
      
      const rawScore = fuzzyMatchScore(value, query);
      const weight = fieldWeights[field] || 1.0;
      const weightedScore = rawScore * weight;
      
      if (weightedScore > bestScore) {
        bestScore = weightedScore;
        bestField = field;
      }
    }
    
    if (bestScore >= threshold) {
      results.push({
        item,
        score: bestScore,
        matchedField: bestField,
      });
    }
  }
  
  // Sort by score (highest first)
  results.sort((a, b) => b.score - a.score);
  
  // Apply limit
  return results.slice(0, limit);
}

/**
 * Quick faculty name search helper
 * Pre-configured for faculty searching
 */
export function searchFaculty<T extends SearchableItem>(
  faculty: T[],
  query: string,
  options: Partial<FuzzySearchOptions> = {}
): SearchResult<T>[] {
  return fuzzySearch(faculty, query, {
    searchFields: ['name', 'department', 'designation'],
    threshold: 0.25,
    limit: 20,
    fieldWeights: {
      name: 2.0,        // Name is most important
      department: 0.8,  // Department is secondary
      designation: 0.5, // Designation is tertiary
    },
    ...options,
  });
}

/**
 * Highlight matching parts of text (for UI display)
 * Returns array of segments with match flag
 * 
 * @example
 * highlightMatches("Dr. Anil Verma", "verma")
 * // Returns: [
 * //   { text: "Dr. Anil ", isMatch: false },
 * //   { text: "Verma", isMatch: true }
 * // ]
 */
export interface TextSegment {
  text: string;
  isMatch: boolean;
}

export function highlightMatches(text: string, query: string): TextSegment[] {
  if (!query || !text) return [{ text, isMatch: false }];
  
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  
  if (index === -1) {
    // No exact substring match, return whole text
    return [{ text, isMatch: false }];
  }
  
  const segments: TextSegment[] = [];
  
  if (index > 0) {
    segments.push({ text: text.slice(0, index), isMatch: false });
  }
  
  segments.push({ text: text.slice(index, index + query.length), isMatch: true });
  
  if (index + query.length < text.length) {
    segments.push({ text: text.slice(index + query.length), isMatch: false });
  }
  
  return segments;
}
