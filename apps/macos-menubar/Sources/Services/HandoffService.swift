import Foundation
import AppKit
import Combine

// MARK: - Handoff Service
/// Cross-device continuity for Ferni
/// Continue conversations, share insights across devices

class HandoffService: NSObject, ObservableObject {

    // MARK: - Singleton

    static let shared = HandoffService()

    // MARK: - Activity Types

    static let activityTypeConversation = "com.ferni.voice.conversation"
    static let activityTypeInsight = "com.ferni.voice.insight"
    static let activityTypePersona = "com.ferni.voice.persona"

    // MARK: - Published State

    /// Currently advertised activity
    @Published private(set) var currentActivity: NSUserActivity?

    /// Pending handoff from another device
    @Published private(set) var pendingHandoff: HandoffData?

    /// Whether handoff is available
    @Published private(set) var isHandoffAvailable: Bool = true

    // MARK: - Callbacks

    var onReceiveHandoff: ((HandoffData) -> Void)?

    // MARK: - Private

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    private override init() {
        super.init()
    }

    // MARK: - Advertising Activities

    /// Advertise a voice conversation for handoff
    func advertiseConversation(
        personaId: String,
        personaName: String,
        conversationId: String? = nil,
        lastMessage: String? = nil
    ) {
        let activity = NSUserActivity(activityType: Self.activityTypeConversation)

        activity.title = "Continue conversation with \(personaName)"
        activity.isEligibleForHandoff = true
        activity.isEligibleForSearch = true
        activity.isEligibleForPublicIndexing = false

        var userInfo: [String: Any] = [
            "personaId": personaId,
            "personaName": personaName,
            "timestamp": Date().timeIntervalSince1970
        ]

        if let conversationId = conversationId {
            userInfo["conversationId"] = conversationId
        }

        if let lastMessage = lastMessage {
            userInfo["lastMessage"] = String(lastMessage.prefix(200))
        }

        activity.userInfo = userInfo
        activity.needsSave = true

        activity.becomeCurrent()
        currentActivity = activity
    }

    /// Advertise an insight for viewing on another device
    func advertiseInsight(
        insightId: String,
        title: String,
        summary: String,
        personaId: String? = nil
    ) {
        let activity = NSUserActivity(activityType: Self.activityTypeInsight)

        activity.title = title
        activity.isEligibleForHandoff = true
        activity.isEligibleForSearch = true
        activity.isEligibleForPublicIndexing = false

        var userInfo: [String: Any] = [
            "insightId": insightId,
            "title": title,
            "summary": String(summary.prefix(500)),
            "timestamp": Date().timeIntervalSince1970
        ]

        if let personaId = personaId {
            userInfo["personaId"] = personaId
        }

        activity.userInfo = userInfo
        activity.needsSave = true

        activity.becomeCurrent()
        currentActivity = activity
    }

    /// Advertise persona selection for quick switch on another device
    func advertisePersonaContext(
        personaId: String,
        personaName: String,
        context: String? = nil
    ) {
        let activity = NSUserActivity(activityType: Self.activityTypePersona)

        activity.title = "Using \(personaName)"
        activity.isEligibleForHandoff = true
        activity.isEligibleForSearch = false
        activity.isEligibleForPublicIndexing = false

        var userInfo: [String: Any] = [
            "personaId": personaId,
            "personaName": personaName,
            "timestamp": Date().timeIntervalSince1970
        ]

        if let context = context {
            userInfo["context"] = String(context.prefix(300))
        }

        activity.userInfo = userInfo
        activity.needsSave = true

        activity.becomeCurrent()
        currentActivity = activity
    }

    /// Stop advertising current activity
    func stopAdvertising() {
        currentActivity?.invalidate()
        currentActivity = nil
    }

    // MARK: - Receiving Handoffs

    /// Handle incoming handoff from app delegate
    func handleIncomingHandoff(_ userActivity: NSUserActivity) -> Bool {
        guard let userInfo = userActivity.userInfo else { return false }

        switch userActivity.activityType {
        case Self.activityTypeConversation:
            guard let personaId = userInfo["personaId"] as? String,
                  let personaName = userInfo["personaName"] as? String else {
                return false
            }

            let handoff = HandoffData(
                type: .conversation,
                personaId: personaId,
                personaName: personaName,
                conversationId: userInfo["conversationId"] as? String,
                lastMessage: userInfo["lastMessage"] as? String,
                timestamp: Date(timeIntervalSince1970: userInfo["timestamp"] as? TimeInterval ?? 0)
            )

            pendingHandoff = handoff
            onReceiveHandoff?(handoff)
            return true

        case Self.activityTypeInsight:
            guard let insightId = userInfo["insightId"] as? String,
                  let title = userInfo["title"] as? String else {
                return false
            }

            let handoff = HandoffData(
                type: .insight,
                personaId: userInfo["personaId"] as? String,
                personaName: nil,
                insightId: insightId,
                insightTitle: title,
                insightSummary: userInfo["summary"] as? String,
                timestamp: Date(timeIntervalSince1970: userInfo["timestamp"] as? TimeInterval ?? 0)
            )

            pendingHandoff = handoff
            onReceiveHandoff?(handoff)
            return true

        case Self.activityTypePersona:
            guard let personaId = userInfo["personaId"] as? String,
                  let personaName = userInfo["personaName"] as? String else {
                return false
            }

            let handoff = HandoffData(
                type: .persona,
                personaId: personaId,
                personaName: personaName,
                context: userInfo["context"] as? String,
                timestamp: Date(timeIntervalSince1970: userInfo["timestamp"] as? TimeInterval ?? 0)
            )

            pendingHandoff = handoff
            onReceiveHandoff?(handoff)
            return true

        default:
            return false
        }
    }

    /// Clear pending handoff after it's been handled
    func clearPendingHandoff() {
        pendingHandoff = nil
    }

    // MARK: - Universal Clipboard

    /// Copy text to clipboard with handoff support
    func copyToClipboard(_ text: String, type: String = "insight") {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)

        // Set up handoff for clipboard content
        if type == "insight" {
            advertiseInsight(
                insightId: UUID().uuidString,
                title: "Shared Insight",
                summary: text
            )
        }
    }

    /// Get text from clipboard
    func getFromClipboard() -> String? {
        return NSPasteboard.general.string(forType: .string)
    }

    // MARK: - Export for Sharing

    /// Export conversation as shareable data
    func exportConversation(
        messages: [(role: String, content: String)],
        personaName: String
    ) -> Data? {
        let export = ConversationExport(
            personaName: personaName,
            messages: messages.map { ConversationMessage(role: $0.role, content: $0.content) },
            exportedAt: Date(),
            version: "1.0"
        )

        return try? JSONEncoder().encode(export)
    }

    /// Import conversation from shared data
    func importConversation(from data: Data) -> ConversationExport? {
        return try? JSONDecoder().decode(ConversationExport.self, from: data)
    }

    // MARK: - AirDrop Support

    /// Create a shareable file for AirDrop
    func createShareableFile(
        content: String,
        filename: String = "ferni-insight"
    ) -> URL? {
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent("\(filename).txt")

        do {
            try content.write(to: fileURL, atomically: true, encoding: .utf8)
            return fileURL
        } catch {
            print("[Handoff] Failed to create shareable file: \(error)")
            return nil
        }
    }
}

// MARK: - Supporting Types

enum HandoffType: String {
    case conversation
    case insight
    case persona
}

struct HandoffData {
    let type: HandoffType

    // Common
    let personaId: String?
    let personaName: String?
    let timestamp: Date

    // Conversation specific
    var conversationId: String?
    var lastMessage: String?

    // Insight specific
    var insightId: String?
    var insightTitle: String?
    var insightSummary: String?

    // Persona specific
    var context: String?

    init(
        type: HandoffType,
        personaId: String? = nil,
        personaName: String? = nil,
        conversationId: String? = nil,
        lastMessage: String? = nil,
        insightId: String? = nil,
        insightTitle: String? = nil,
        insightSummary: String? = nil,
        context: String? = nil,
        timestamp: Date = Date()
    ) {
        self.type = type
        self.personaId = personaId
        self.personaName = personaName
        self.conversationId = conversationId
        self.lastMessage = lastMessage
        self.insightId = insightId
        self.insightTitle = insightTitle
        self.insightSummary = insightSummary
        self.context = context
        self.timestamp = timestamp
    }
}

struct ConversationExport: Codable {
    let personaName: String
    let messages: [ConversationMessage]
    let exportedAt: Date
    let version: String
}

struct ConversationMessage: Codable {
    let role: String
    let content: String
}

// MARK: - NSUserActivity Extension

extension NSUserActivity {
    /// Create a Ferni conversation activity
    static func ferniConversation(
        personaId: String,
        personaName: String
    ) -> NSUserActivity {
        let activity = NSUserActivity(activityType: HandoffService.activityTypeConversation)
        activity.title = "Conversation with \(personaName)"
        activity.userInfo = [
            "personaId": personaId,
            "personaName": personaName
        ]
        activity.isEligibleForHandoff = true
        return activity
    }
}
