//
//  WatchConnectivityService.swift
//  FerniVoice
//
//  Two-way communication between iPhone and Apple Watch.
//  Enables Watch to trigger voice sessions and receive real-time updates.
//
//  🎯 CAPABILITIES:
//  - Watch triggers "Talk to Ferni" on iPhone
//  - Mood check-ins sync bidirectionally
//  - Voice session state pushes to Watch
//  - Complications update from phone data
//

import Foundation
import WatchConnectivity
import Combine
import os

// MARK: - Watch Connectivity Service

@MainActor
final class WatchConnectivityService: NSObject, ObservableObject {
    static let shared = WatchConnectivityService()
    
    // MARK: - Published State
    
    @Published private(set) var isReachable: Bool = false
    @Published private(set) var isPaired: Bool = false
    @Published private(set) var isWatchAppInstalled: Bool = false
    @Published private(set) var lastReceivedMood: MoodState?
    @Published private(set) var pendingWatchAction: WatchAction?
    
    // MARK: - Publishers
    
    /// Emits when Watch requests to start a voice session
    let voiceSessionRequestPublisher = PassthroughSubject<VoiceSessionRequest, Never>()
    
    /// Emits when Watch sends a mood check-in
    let moodCheckInPublisher = PassthroughSubject<MoodCheckIn, Never>()
    
    // MARK: - Private
    
    private let session: WCSession
    private let logger = Logger(subsystem: "com.ferni.FerniVoice", category: "WatchConnectivity")
    private let defaults = UserDefaults(suiteName: "group.com.ferni.shared")
    
    // MARK: - Message Keys
    
    private enum MessageKey {
        static let action = "action"
        static let mood = "mood"
        static let context = "context"
        static let voiceState = "voiceState"
        static let personaId = "personaId"
        static let personaName = "personaName"
        static let sessionId = "sessionId"
        static let timestamp = "timestamp"
        static let streakDays = "streakDays"
        static let lastCheckIn = "lastCheckIn"
        static let isSubscribed = "isSubscribed"
    }
    
    // MARK: - Initialization
    
    private override init() {
        session = WCSession.default
        super.init()
        
        if WCSession.isSupported() {
            session.delegate = self
            session.activate()
            logger.info("WatchConnectivity session activating...")
        } else {
            logger.warning("WatchConnectivity not supported on this device")
        }
    }
    
    // MARK: - Connection Status
    
    func checkConnection() {
        guard WCSession.isSupported() else { return }
        
        isPaired = session.isPaired
        isWatchAppInstalled = session.isWatchAppInstalled
        isReachable = session.isReachable
        
        logger.info("Watch connection: paired=\(self.isPaired), installed=\(self.isWatchAppInstalled), reachable=\(self.isReachable)")
    }
    
    // MARK: - Send to Watch
    
    /// Send voice session state update to Watch
    func sendVoiceStateUpdate(_ state: VoiceState) {
        guard session.isReachable else {
            // Use application context for when watch isn't reachable
            updateApplicationContext(voiceState: state)
            return
        }
        
        let message: [String: Any] = [
            MessageKey.action: "voiceStateUpdate",
            MessageKey.voiceState: state.rawValue,
            MessageKey.timestamp: Date().timeIntervalSince1970
        ]
        
        session.sendMessage(message, replyHandler: nil) { [weak self] error in
            self?.logger.error("Failed to send voice state: \(error.localizedDescription)")
        }
    }
    
    /// Send persona change to Watch
    func sendPersonaUpdate(id: String, name: String) {
        guard session.isReachable else {
            updateApplicationContext(personaId: id, personaName: name)
            return
        }
        
        let message: [String: Any] = [
            MessageKey.action: "personaUpdate",
            MessageKey.personaId: id,
            MessageKey.personaName: name,
            MessageKey.timestamp: Date().timeIntervalSince1970
        ]
        
        session.sendMessage(message, replyHandler: nil) { [weak self] error in
            self?.logger.error("Failed to send persona update: \(error.localizedDescription)")
        }
    }
    
    /// Send mood acknowledgment to Watch
    func sendMoodAcknowledgment(mood: MoodState, message: String) {
        guard session.isReachable else { return }
        
        let payload: [String: Any] = [
            MessageKey.action: "moodAcknowledged",
            MessageKey.mood: mood.rawValue,
            "message": message,
            MessageKey.timestamp: Date().timeIntervalSince1970
        ]
        
        session.sendMessage(payload, replyHandler: nil) { [weak self] error in
            self?.logger.error("Failed to send mood acknowledgment: \(error.localizedDescription)")
        }
    }
    
    /// Send streak update to Watch
    func sendStreakUpdate(days: Int, lastCheckIn: Date?) {
        let context: [String: Any] = [
            MessageKey.streakDays: days,
            MessageKey.lastCheckIn: lastCheckIn?.timeIntervalSince1970 ?? 0
        ]
        
        updateApplicationContext(additionalData: context)
    }
    
    /// Send subscription status to Watch
    func sendSubscriptionStatus(isSubscribed: Bool) {
        updateApplicationContext(additionalData: [MessageKey.isSubscribed: isSubscribed])
    }
    
    // MARK: - Application Context (Background Sync)
    
    private var currentContext: [String: Any] = [:]
    
    private func updateApplicationContext(
        voiceState: VoiceState? = nil,
        personaId: String? = nil,
        personaName: String? = nil,
        additionalData: [String: Any]? = nil
    ) {
        if let state = voiceState {
            currentContext[MessageKey.voiceState] = state.rawValue
        }
        if let id = personaId {
            currentContext[MessageKey.personaId] = id
        }
        if let name = personaName {
            currentContext[MessageKey.personaName] = name
        }
        if let additional = additionalData {
            for (key, value) in additional {
                currentContext[key] = value
            }
        }
        
        currentContext[MessageKey.timestamp] = Date().timeIntervalSince1970
        
        do {
            try session.updateApplicationContext(currentContext)
            logger.debug("Updated application context")
        } catch {
            logger.error("Failed to update application context: \(error.localizedDescription)")
        }
    }
    
    // MARK: - Complication Updates
    
    /// Transfer complication data to Watch
    func updateComplication(with entry: ComplicationData) {
        guard session.isComplicationEnabled else {
            logger.debug("Complications not enabled")
            return
        }
        
        let userInfo: [String: Any] = [
            "complicationData": true,
            "mood": entry.mood.rawValue,
            "greeting": entry.greeting,
            "streakDays": entry.streakDays,
            MessageKey.timestamp: Date().timeIntervalSince1970
        ]
        
        session.transferCurrentComplicationUserInfo(userInfo)
        logger.info("Transferred complication data")
    }
    
    // MARK: - Handle Watch Actions
    
    func clearPendingAction() {
        pendingWatchAction = nil
    }
}

// MARK: - WCSessionDelegate

extension WatchConnectivityService: WCSessionDelegate {
    
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        Task { @MainActor in
            if let error = error {
                logger.error("WCSession activation failed: \(error.localizedDescription)")
                return
            }
            
            logger.info("WCSession activated: \(activationState.rawValue)")
            checkConnection()
        }
    }
    
    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {
        Task { @MainActor in
            logger.info("WCSession became inactive")
        }
    }
    
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        Task { @MainActor in
            logger.info("WCSession deactivated")
            // Reactivate for switching between watches
            session.activate()
        }
    }
    
    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in
            isReachable = session.isReachable
            logger.info("Watch reachability changed: \(session.isReachable)")
        }
    }
    
    // MARK: - Receive Messages
    
    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any]
    ) {
        Task { @MainActor in
            handleMessage(message)
        }
    }
    
    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        Task { @MainActor in
            let response = handleMessage(message)
            replyHandler(response)
        }
    }
    
    @MainActor
    @discardableResult
    private func handleMessage(_ message: [String: Any]) -> [String: Any] {
        guard let action = message[MessageKey.action] as? String else {
            logger.warning("Received message without action")
            return ["success": false, "error": "No action specified"]
        }
        
        logger.info("Received Watch action: \(action)")
        
        switch action {
        case "startVoiceSession":
            let context = message[MessageKey.context] as? String
            let request = VoiceSessionRequest(context: context)
            pendingWatchAction = .startVoice(request)
            voiceSessionRequestPublisher.send(request)
            return ["success": true, "message": "Voice session starting"]
            
        case "moodCheckIn":
            guard let moodString = message[MessageKey.mood] as? String,
                  let mood = MoodState(rawValue: moodString) else {
                return ["success": false, "error": "Invalid mood"]
            }
            
            let checkIn = MoodCheckIn(mood: mood, timestamp: Date())
            lastReceivedMood = mood
            pendingWatchAction = .moodCheckIn(checkIn)
            moodCheckInPublisher.send(checkIn)
            
            // Save to shared defaults
            defaults?.set(mood.rawValue, forKey: "lastMood")
            defaults?.set(Date(), forKey: "lastCheckIn")
            
            // Update streak
            let streak = (defaults?.integer(forKey: "checkInStreak") ?? 0) + 1
            defaults?.set(streak, forKey: "checkInStreak")
            
            return ["success": true, "streak": streak]
            
        case "requestStatus":
            // Watch is asking for current state
            return [
                "success": true,
                MessageKey.voiceState: currentContext[MessageKey.voiceState] ?? "disconnected",
                MessageKey.personaId: currentContext[MessageKey.personaId] ?? "ferni",
                MessageKey.personaName: currentContext[MessageKey.personaName] ?? "Ferni",
                MessageKey.streakDays: defaults?.integer(forKey: "checkInStreak") ?? 0
            ]
            
        case "quickVent":
            let request = VoiceSessionRequest(context: "vent")
            pendingWatchAction = .startVoice(request)
            voiceSessionRequestPublisher.send(request)
            return ["success": true, "message": "Starting vent session"]
            
        case "playCalming":
            pendingWatchAction = .playMusic("calming")
            return ["success": true, "message": "Playing calming music"]
            
        default:
            logger.warning("Unknown Watch action: \(action)")
            return ["success": false, "error": "Unknown action"]
        }
    }
    
    // MARK: - Receive User Info
    
    nonisolated func session(
        _ session: WCSession,
        didReceiveUserInfo userInfo: [String: Any]
    ) {
        Task { @MainActor in
            logger.debug("Received user info from Watch")
            // Handle any file transfers or bulk data
        }
    }
    
    // MARK: - Receive Application Context
    
    nonisolated func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        Task { @MainActor in
            logger.debug("Received application context from Watch")
            
            // Sync mood if Watch updated it
            if let moodString = applicationContext[MessageKey.mood] as? String,
               let mood = MoodState(rawValue: moodString) {
                lastReceivedMood = mood
            }
        }
    }
}

// MARK: - Supporting Types

/// Voice session state
enum VoiceState: String {
    case disconnected
    case connecting
    case connected
    case listening
    case thinking
    case speaking
    
    var isActive: Bool {
        switch self {
        case .connected, .listening, .thinking, .speaking:
            return true
        default:
            return false
        }
    }
}

/// Mood states (matches Watch complications)
enum MoodState: String, CaseIterable {
    case great
    case good
    case okay
    case meh
    case low
    case unknown
    
    var emoji: String {
        switch self {
        case .great: return "😊"
        case .good: return "🙂"
        case .okay: return "😐"
        case .meh: return "😕"
        case .low: return "😔"
        case .unknown: return "🤔"
        }
    }
    
    var description: String {
        switch self {
        case .great: return "Feeling great"
        case .good: return "Pretty good"
        case .okay: return "Doing okay"
        case .meh: return "Meh"
        case .low: return "Feeling low"
        case .unknown: return "Not sure"
        }
    }
}

/// Request from Watch to start voice session
struct VoiceSessionRequest {
    let context: String?
    let timestamp: Date = Date()
}

/// Mood check-in from Watch
struct MoodCheckIn {
    let mood: MoodState
    let timestamp: Date
}

/// Action requested by Watch
enum WatchAction {
    case startVoice(VoiceSessionRequest)
    case moodCheckIn(MoodCheckIn)
    case playMusic(String)
}

/// Data for Watch complications
struct ComplicationData {
    let mood: MoodState
    let greeting: String
    let streakDays: Int
}
