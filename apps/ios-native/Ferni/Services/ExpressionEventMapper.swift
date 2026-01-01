// MARK: - Expression Event Mapper
// Maps backend emotion/humanization signals to Avatar expressions
//
// This service bridges backend emotion detection with the iOS Window Avatar's
// 100-expression system. It handles:
// - Direct `expression_update` messages
// - `humanization_signal` events (concern_detected, high_engagement, etc.)
// - Voice prosody signals
// - Anticipation signals
//
// Reference: apps/web/src/app/data-message-handlers.ts

import Foundation
import FerniShared

// MARK: - Expression Update Message

/// Direct expression update from backend
struct ExpressionUpdateMessage {
    let expression: String
    let intensity: Float?
    let duration: Int?
    let hold: Int?
    let timestamp: TimeInterval

    init?(from json: [String: Any]) {
        guard json["type"] as? String == "expression_update",
              let expression = json["expression"] as? String else {
            return nil
        }
        self.expression = expression
        self.intensity = json["intensity"] as? Float
        self.duration = json["duration"] as? Int
        self.hold = json["hold"] as? Int
        self.timestamp = json["timestamp"] as? TimeInterval ?? Date().timeIntervalSince1970 * 1000
    }
}

// MARK: - Humanization Signal Message

/// Humanization signal from backend (concern, engagement, trajectory, etc.)
struct HumanizationSignalMessage {
    let signalType: String
    let intensity: Float?
    let concernLevel: String?
    let concernType: String?
    let voiceState: String?
    let emotionalTrajectory: String?
    let timestamp: TimeInterval

    init?(from json: [String: Any]) {
        guard json["type"] as? String == "humanization_signal",
              let signalType = json["signalType"] as? String else {
            return nil
        }
        self.signalType = signalType
        self.intensity = json["intensity"] as? Float
        self.concernLevel = json["concernLevel"] as? String
        self.concernType = json["concernType"] as? String
        self.voiceState = json["voiceState"] as? String
        self.emotionalTrajectory = json["emotionalTrajectory"] as? String
        self.timestamp = json["timestamp"] as? TimeInterval ?? Date().timeIntervalSince1970 * 1000
    }
}

// MARK: - Anticipation Signal Message

/// Anticipation signal from backend (pre-response emotion prediction)
struct AnticipationSignalMessage {
    let predictedEmotion: String
    let emotionConfidence: Float
    let urgency: String?
    let emotionTrajectory: String?
    let timestamp: TimeInterval

    init?(from json: [String: Any]) {
        guard json["type"] as? String == "anticipation_signal",
              let predictedEmotion = json["predictedEmotion"] as? String,
              let confidence = json["emotionConfidence"] as? Float else {
            return nil
        }
        self.predictedEmotion = predictedEmotion
        self.emotionConfidence = confidence
        self.urgency = json["urgency"] as? String
        self.emotionTrajectory = json["emotionTrajectory"] as? String
        self.timestamp = json["timestamp"] as? TimeInterval ?? Date().timeIntervalSince1970 * 1000
    }
}

// MARK: - Micro Expression Type
// Using FerniShared.MicroExpressionType (imported above)
// Mapping: .noticing → .interest, .contemplation → .connection

// MARK: - Expression Event Mapper

/// Maps backend events to Avatar expressions
final class ExpressionEventMapper {

    static let shared = ExpressionEventMapper()

    private init() {}

    // MARK: - Public API

    /// Process any data channel message and return the appropriate expression
    func processMessage(_ json: [String: Any]) -> ExpressionResult? {
        guard let type = json["type"] as? String else { return nil }

        switch type {
        case "expression_update":
            return processExpressionUpdate(json)

        case "humanization_signal":
            return processHumanizationSignal(json)

        case "anticipation_signal":
            return processAnticipationSignal(json)

        default:
            return nil
        }
    }

    // MARK: - Expression Update Processing

    private func processExpressionUpdate(_ json: [String: Any]) -> ExpressionResult? {
        guard let message = ExpressionUpdateMessage(from: json) else { return nil }

        // Map string to AvatarExpression enum
        let expression = AvatarExpression.from(message.expression)

        return ExpressionResult(
            expression: expression,
            microExpression: nil,
            duration: message.duration.map { TimeInterval($0) / 1000.0 },
            hold: message.hold.map { TimeInterval($0) / 1000.0 }
        )
    }

    // MARK: - Humanization Signal Processing

    private func processHumanizationSignal(_ json: [String: Any]) -> ExpressionResult? {
        guard let message = HumanizationSignalMessage(from: json) else { return nil }

        switch message.signalType {
        case "concern_detected":
            return mapConcernSignal(message)

        case "voice_state_detected":
            return ExpressionResult(
                expression: .contemplating,
                microExpression: .concern
            )

        case "emotional_trajectory":
            return mapTrajectorySignal(message)

        case "high_engagement":
            return ExpressionResult(
                expression: .excited,
                microExpression: .delight
            )

        case "disengagement":
            return ExpressionResult(
                expression: .curious,
                microExpression: .interest
            )

        case "vulnerability":
            return ExpressionResult(
                expression: .supportive,
                microExpression: .warmth
            )

        case "breakthrough":
            return ExpressionResult(
                expression: .pleased,
                microExpression: .recognition
            )

        default:
            return nil
        }
    }

    private func mapConcernSignal(_ message: HumanizationSignalMessage) -> ExpressionResult {
        switch message.concernLevel {
        case "crisis":
            return ExpressionResult(
                expression: .comforting,
                microExpression: .protective
            )

        case "elevated":
            return ExpressionResult(
                expression: .attentive,
                microExpression: .concern
            )

        case "moderate":
            return ExpressionResult(
                expression: .attentive,
                microExpression: .warmth
            )

        case "mild":
            return ExpressionResult(
                expression: .engaged,
                microExpression: .interest
            )

        default:
            return ExpressionResult(
                expression: .listening,
                microExpression: nil
            )
        }
    }

    private func mapTrajectorySignal(_ message: HumanizationSignalMessage) -> ExpressionResult {
        switch message.emotionalTrajectory {
        case "escalating":
            return ExpressionResult(
                expression: .attentive,
                microExpression: .warmth
            )

        case "de_escalating":
            return ExpressionResult(
                expression: .present,
                microExpression: .recognition
            )

        case "volatile":
            return ExpressionResult(
                expression: .supportive,
                microExpression: .interest
            )

        default:
            return ExpressionResult(
                expression: .listening,
                microExpression: nil
            )
        }
    }

    // MARK: - Anticipation Signal Processing

    private func processAnticipationSignal(_ json: [String: Any]) -> ExpressionResult? {
        guard let message = AnticipationSignalMessage(from: json) else { return nil }

        // Only respond to high-confidence predictions
        guard message.emotionConfidence >= 0.6 else { return nil }

        switch message.predictedEmotion {
        case "sad", "distressed", "anxious":
            return ExpressionResult(
                expression: .attentive,
                microExpression: .warmth
            )

        case "excited", "happy", "hopeful":
            let expressions: [AvatarExpression] = [.excited, .happy, .pleased]
            return ExpressionResult(
                expression: expressions.randomElement() ?? .happy,
                microExpression: .delight
            )

        case "angry", "frustrated":
            return ExpressionResult(
                expression: .attentive,
                microExpression: .interest
            )

        case "contemplative", "thoughtful":
            return ExpressionResult(
                expression: .contemplating,
                microExpression: .connection
            )

        default:
            return nil
        }
    }

    // MARK: - Emotion to Expression Mapping

    /// Map a raw emotion string to avatar expressions
    func expressionsForEmotion(_ emotion: String) -> [AvatarExpression] {
        switch emotion.lowercased() {
        case "happy":
            return [.happy, .joyful, .pleased]
        case "excited":
            return [.excited, .delighted, .joyful]
        case "sad":
            return [.concerned, .sympathetic, .comforting]
        case "anxious", "nervous":
            return [.supportive, .calm, .grounded]
        case "overwhelmed":
            return [.comforting, .supportive, .calm]
        case "angry", "frustrated":
            return [.attentive, .engaged, .listening]
        case "confused":
            return [.curious, .puzzled, .intrigued]
        case "tired", "exhausted":
            return [.warm, .caring, .gentle]
        case "grateful":
            return [.warm, .pleased, .content]
        case "proud":
            return [.proud, .pleased, .happy]
        case "embarrassed":
            return [.warm, .understanding, .supportive]
        case "hopeful":
            return [.encouraging, .warm, .optimistic]
        default:
            return [.neutral, .listening, .engaged]
        }
    }
}

// MARK: - Expression Result

/// Result of expression mapping, contains both the main expression and optional micro-expression
struct ExpressionResult {
    let expression: AvatarExpression
    let microExpression: MicroExpressionType?
    let duration: TimeInterval?
    let hold: TimeInterval?

    init(
        expression: AvatarExpression,
        microExpression: MicroExpressionType? = nil,
        duration: TimeInterval? = nil,
        hold: TimeInterval? = nil
    ) {
        self.expression = expression
        self.microExpression = microExpression
        self.duration = duration
        self.hold = hold
    }
}

// MARK: - AvatarExpression Convenience

extension AvatarExpression {
    /// Convenience expressions for common emotional states
    static var optimistic: AvatarExpression { .encouraging }
    static var gentle: AvatarExpression { .tender }
}
