import Foundation
import NaturalLanguage

// MARK: - Natural Language Service
/// Provides local NLP capabilities
/// Sentiment analysis, entity extraction, language detection - all on-device

class NaturalLanguageService {

    // MARK: - Singleton

    static let shared = NaturalLanguageService()

    private init() {}

    // MARK: - Sentiment Analysis

    /// Analyze sentiment of text
    /// Returns value from -1.0 (very negative) to 1.0 (very positive)
    func analyzeSentiment(_ text: String) -> SentimentResult {
        let tagger = NLTagger(tagSchemes: [.sentimentScore])
        tagger.string = text

        var totalScore: Double = 0
        var count = 0

        tagger.enumerateTags(in: text.startIndex..<text.endIndex,
                             unit: .paragraph,
                             scheme: .sentimentScore) { tag, range in
            if let tag = tag, let score = Double(tag.rawValue) {
                totalScore += score
                count += 1
            }
            return true
        }

        let averageScore = count > 0 ? totalScore / Double(count) : 0

        return SentimentResult(
            score: averageScore,
            label: classifySentiment(averageScore),
            confidence: min(abs(averageScore) + 0.3, 1.0)
        )
    }

    private func classifySentiment(_ score: Double) -> SentimentLabel {
        switch score {
        case 0.5...: return .veryPositive
        case 0.1..<0.5: return .positive
        case -0.1..<0.1: return .neutral
        case -0.5..<(-0.1): return .negative
        default: return .veryNegative
        }
    }

    // MARK: - Entity Extraction

    /// Extract named entities from text
    func extractEntities(_ text: String) -> EntityExtractionResult {
        let tagger = NLTagger(tagSchemes: [.nameType])
        tagger.string = text

        var entities: [String: [String]] = [:]

        let options: NLTagger.Options = [.omitWhitespace, .omitPunctuation, .joinNames]

        tagger.enumerateTags(in: text.startIndex..<text.endIndex,
                             unit: .word,
                             scheme: .nameType,
                             options: options) { tag, tokenRange in
            if let tag = tag {
                let entity = String(text[tokenRange])
                let category = tag.rawValue

                if entities[category] == nil {
                    entities[category] = []
                }
                if !entities[category]!.contains(entity) {
                    entities[category]!.append(entity)
                }
            }
            return true
        }

        return EntityExtractionResult(
            people: entities["PersonalName"] ?? [],
            places: entities["PlaceName"] ?? [],
            organizations: entities["OrganizationName"] ?? []
        )
    }

    // MARK: - Language Detection

    /// Detect the language of text
    func detectLanguage(_ text: String) -> LanguageDetectionResult {
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(text)

        if let language = recognizer.dominantLanguage {
            let hypotheses = recognizer.languageHypotheses(withMaximum: 3)

            return LanguageDetectionResult(
                dominantLanguage: language,
                languageName: Locale.current.localizedString(forLanguageCode: language.rawValue) ?? language.rawValue,
                confidence: hypotheses[language] ?? 0,
                alternatives: hypotheses.filter { $0.key != language }
                    .map { ($0.key, $0.value) }
                    .sorted { $0.1 > $1.1 }
            )
        }

        return LanguageDetectionResult(
            dominantLanguage: .undetermined,
            languageName: "Unknown",
            confidence: 0,
            alternatives: []
        )
    }

    // MARK: - Tokenization

    /// Tokenize text into words
    func tokenize(_ text: String, unit: NLTokenUnit = .word) -> [String] {
        let tokenizer = NLTokenizer(unit: unit)
        tokenizer.string = text

        var tokens: [String] = []
        tokenizer.enumerateTokens(in: text.startIndex..<text.endIndex) { range, _ in
            tokens.append(String(text[range]))
            return true
        }

        return tokens
    }

    // MARK: - Lemmatization

    /// Get lemmas (base forms) of words
    func lemmatize(_ text: String) -> [String: String] {
        let tagger = NLTagger(tagSchemes: [.lemma])
        tagger.string = text

        var lemmas: [String: String] = [:]

        tagger.enumerateTags(in: text.startIndex..<text.endIndex,
                             unit: .word,
                             scheme: .lemma,
                             options: [.omitWhitespace, .omitPunctuation]) { tag, range in
            let word = String(text[range])
            if let lemma = tag?.rawValue, !lemma.isEmpty {
                lemmas[word] = lemma
            }
            return true
        }

        return lemmas
    }

    // MARK: - Intent Classification

    /// Simple intent classification for user messages
    func classifyIntent(_ text: String) -> IntentClassification {
        let lowercased = text.lowercased()

        // Question detection
        let questionWords = ["what", "where", "when", "why", "how", "who", "which", "is", "are", "do", "does", "can", "could", "would", "should"]
        let isQuestion = lowercased.hasSuffix("?") || questionWords.contains { lowercased.hasPrefix($0 + " ") }

        // Emotional state detection
        let emotionalPatterns: [(pattern: String, emotion: String, valence: Double)] = [
            ("happy|excited|great|amazing|wonderful", "joy", 0.8),
            ("sad|upset|depressed|down|unhappy", "sadness", -0.7),
            ("angry|frustrated|annoyed|mad", "anger", -0.6),
            ("anxious|worried|nervous|stressed", "anxiety", -0.5),
            ("tired|exhausted|drained|sleepy", "fatigue", -0.3),
            ("grateful|thankful|appreciative", "gratitude", 0.7),
            ("confused|uncertain|unsure|lost", "confusion", -0.2),
            ("lonely|isolated|alone", "loneliness", -0.6)
        ]

        var detectedEmotions: [(String, Double)] = []
        for (pattern, emotion, valence) in emotionalPatterns {
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
                let range = NSRange(lowercased.startIndex..., in: lowercased)
                if regex.firstMatch(in: lowercased, options: [], range: range) != nil {
                    detectedEmotions.append((emotion, valence))
                }
            }
        }

        // Action intent detection
        let actionPatterns: [(pattern: String, intent: String)] = [
            ("help|assist|support", "request_help"),
            ("remind|reminder|don't forget", "set_reminder"),
            ("schedule|calendar|meeting|appointment", "scheduling"),
            ("tell me about|explain|what is", "information"),
            ("how do i|how can i|how to", "guidance"),
            ("feel|feeling|emotion", "emotional_expression"),
            ("thank|thanks|appreciate", "gratitude_expression"),
            ("sorry|apologize|my bad", "apology")
        ]

        var detectedIntents: [String] = []
        for (pattern, intent) in actionPatterns {
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
                let range = NSRange(lowercased.startIndex..., in: lowercased)
                if regex.firstMatch(in: lowercased, options: [], range: range) != nil {
                    detectedIntents.append(intent)
                }
            }
        }

        // Primary intent
        let primaryIntent: String
        if isQuestion {
            primaryIntent = detectedIntents.first ?? "question"
        } else if !detectedIntents.isEmpty {
            primaryIntent = detectedIntents.first!
        } else if !detectedEmotions.isEmpty {
            primaryIntent = "emotional_expression"
        } else {
            primaryIntent = "statement"
        }

        return IntentClassification(
            primaryIntent: primaryIntent,
            isQuestion: isQuestion,
            detectedEmotions: detectedEmotions,
            allIntents: detectedIntents
        )
    }

    // MARK: - Text Complexity

    /// Analyze text complexity
    func analyzeComplexity(_ text: String) -> TextComplexity {
        let words = tokenize(text, unit: .word)
        let sentences = tokenize(text, unit: .sentence)

        let wordCount = words.count
        let sentenceCount = max(sentences.count, 1)
        let avgWordsPerSentence = Double(wordCount) / Double(sentenceCount)

        // Count syllables (approximate)
        let syllableCount = words.reduce(0) { $0 + countSyllables($1) }
        let avgSyllablesPerWord = wordCount > 0 ? Double(syllableCount) / Double(wordCount) : 0

        // Flesch-Kincaid Grade Level (approximate)
        let gradeLevel = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59

        return TextComplexity(
            wordCount: wordCount,
            sentenceCount: sentenceCount,
            avgWordsPerSentence: avgWordsPerSentence,
            avgSyllablesPerWord: avgSyllablesPerWord,
            readingLevel: classifyReadingLevel(gradeLevel)
        )
    }

    private func countSyllables(_ word: String) -> Int {
        let vowels = CharacterSet(charactersIn: "aeiouAEIOU")
        var count = 0
        var wasVowel = false

        for char in word.unicodeScalars {
            let isVowel = vowels.contains(char)
            if isVowel && !wasVowel {
                count += 1
            }
            wasVowel = isVowel
        }

        // Adjust for silent 'e'
        if word.lowercased().hasSuffix("e") && count > 1 {
            count -= 1
        }

        return max(count, 1)
    }

    private func classifyReadingLevel(_ grade: Double) -> ReadingLevel {
        switch grade {
        case ..<5: return .elementary
        case 5..<8: return .middleSchool
        case 8..<12: return .highSchool
        case 12..<16: return .college
        default: return .advanced
        }
    }

    // MARK: - Keyword Extraction

    /// Extract key terms from text
    func extractKeywords(_ text: String, maxCount: Int = 10) -> [KeywordResult] {
        let words = tokenize(text, unit: .word)
            .map { $0.lowercased() }
            .filter { $0.count > 3 }

        // Filter stop words
        let stopWords = Set(["this", "that", "with", "have", "from", "they", "will", "would", "could", "should", "been", "being", "were", "about", "more", "than", "very", "just", "also", "some", "into", "other"])
        let filtered = words.filter { !stopWords.contains($0) }

        // Count frequency
        var frequency: [String: Int] = [:]
        for word in filtered {
            frequency[word, default: 0] += 1
        }

        // Extract entities for boost
        let entities = extractEntities(text)
        let entityWords = Set((entities.people + entities.places + entities.organizations)
            .flatMap { $0.lowercased().components(separatedBy: " ") })

        // Score keywords
        let maxFreq = Double(frequency.values.max() ?? 1)
        let keywords = frequency.map { word, count in
            let freqScore = Double(count) / maxFreq
            let entityBoost = entityWords.contains(word) ? 0.3 : 0
            let score = freqScore + entityBoost

            return KeywordResult(
                word: word,
                count: count,
                score: min(score, 1.0)
            )
        }
        .sorted { $0.score > $1.score }
        .prefix(maxCount)

        return Array(keywords)
    }

    // MARK: - Context for Agent

    /// Analyze text and generate context for the agent
    func analyzeForAgent(_ text: String) -> AgentTextAnalysis {
        let sentiment = analyzeSentiment(text)
        let entities = extractEntities(text)
        let intent = classifyIntent(text)
        let language = detectLanguage(text)

        return AgentTextAnalysis(
            sentiment: sentiment,
            entities: entities,
            intent: intent,
            language: language
        )
    }
}

// MARK: - Result Types

struct SentimentResult {
    let score: Double  // -1.0 to 1.0
    let label: SentimentLabel
    let confidence: Double
}

enum SentimentLabel: String {
    case veryPositive = "very_positive"
    case positive = "positive"
    case neutral = "neutral"
    case negative = "negative"
    case veryNegative = "very_negative"
}

struct EntityExtractionResult {
    let people: [String]
    let places: [String]
    let organizations: [String]

    var isEmpty: Bool {
        people.isEmpty && places.isEmpty && organizations.isEmpty
    }

    var summary: String {
        var parts: [String] = []
        if !people.isEmpty { parts.append("People: \(people.joined(separator: ", "))") }
        if !places.isEmpty { parts.append("Places: \(places.joined(separator: ", "))") }
        if !organizations.isEmpty { parts.append("Orgs: \(organizations.joined(separator: ", "))") }
        return parts.joined(separator: "; ")
    }
}

struct LanguageDetectionResult {
    let dominantLanguage: NLLanguage
    let languageName: String
    let confidence: Double
    let alternatives: [(NLLanguage, Double)]
}

struct IntentClassification {
    let primaryIntent: String
    let isQuestion: Bool
    let detectedEmotions: [(emotion: String, valence: Double)]
    let allIntents: [String]

    var dominantEmotion: String? {
        detectedEmotions.first?.emotion
    }

    var emotionalValence: Double {
        guard !detectedEmotions.isEmpty else { return 0 }
        return detectedEmotions.reduce(0) { $0 + $1.valence } / Double(detectedEmotions.count)
    }
}

struct TextComplexity {
    let wordCount: Int
    let sentenceCount: Int
    let avgWordsPerSentence: Double
    let avgSyllablesPerWord: Double
    let readingLevel: ReadingLevel
}

enum ReadingLevel: String {
    case elementary = "elementary"
    case middleSchool = "middle_school"
    case highSchool = "high_school"
    case college = "college"
    case advanced = "advanced"
}

struct KeywordResult {
    let word: String
    let count: Int
    let score: Double
}

struct AgentTextAnalysis {
    let sentiment: SentimentResult
    let entities: EntityExtractionResult
    let intent: IntentClassification
    let language: LanguageDetectionResult

    func toDict() -> [String: Any] {
        var dict: [String: Any] = [
            "sentiment": [
                "score": sentiment.score,
                "label": sentiment.label.rawValue,
                "confidence": sentiment.confidence
            ],
            "intent": [
                "primary": intent.primaryIntent,
                "isQuestion": intent.isQuestion
            ],
            "language": language.languageName
        ]

        if !entities.isEmpty {
            var entityDict: [String: Any] = [:]
            if !entities.people.isEmpty { entityDict["people"] = entities.people }
            if !entities.places.isEmpty { entityDict["places"] = entities.places }
            if !entities.organizations.isEmpty { entityDict["organizations"] = entities.organizations }
            dict["entities"] = entityDict
        }

        if let emotion = intent.dominantEmotion {
            dict["emotion"] = emotion
        }

        return dict
    }
}
