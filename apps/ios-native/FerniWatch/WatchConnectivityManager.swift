//
//  WatchConnectivityManager.swift
//  FerniWatch
//
//  Watch-side WatchConnectivity for two-way communication with iPhone.
//  Enables Watch to trigger voice sessions and receive updates.
//

import Foundation
import WatchConnectivity
import Combine

// MARK: - Watch Connectivity Manager

final class WatchConnectivityManager: NSObject, ObservableObject {
    static let shared = WatchConnectivityManager()
    
    // MARK: - Published State
    
    @Published private(set) var isReachable: Bool = false
    @Published private(set) var voiceState: String = "disconnected"
    @Published private(set) var currentPersonaId: String = "ferni"
    @Published private(set) var currentPersonaName: String = "Ferni"
    @Published private(set) var streakDays: Int = 0
    @Published private(set) var isSubscribed: Bool = false
    @Published private(set) var lastAcknowledgment: String?
    
    // MARK: - Private
    
    private let session: WCSession
    private let defaults = UserDefaults(suiteName: "group.com.ferni.shared")
    
    // MARK: - Message Keys
    
    private enum MessageKey {
        static let action = "action"
        static let mood = "mood"
        static let context = "context"
        static let voiceState = "voiceState"
        static let personaId = "personaId"
        static let personaName = "personaName"
        static let streakDays = "streakDays"
        static let isSubscribed = "isSubscribed"
    }
    
    // MARK: - Initialization
    
    private override init() {
        session = WCSession.default
        super.init()
        
        if WCSession.isSupported() {
            session.delegate = self
            session.activate()
        }
        
        // Load cached data
        loadCachedData()
    }
    
    private func loadCachedData() {
        streakDays = defaults?.integer(forKey: "checkInStreak") ?? 0
    }
    
    // MARK: - Send to iPhone
    
    /// Request iPhone to start a voice session
    func requestVoiceSession(context: String? = nil) {
        guard session.isReachable else {
            print("iPhone not reachable")
            return
        }
        
        var message: [String: Any] = [
            MessageKey.action: "startVoiceSession"
        ]
        
        if let ctx = context {
            message[MessageKey.context] = ctx
        }
        
        session.sendMessage(message, replyHandler: { [weak self] response in
            DispatchQueue.main.async {
                if let success = response["success"] as? Bool, success {
                    self?.voiceState = "connecting"
                }
            }
        }) { error in
            print("Failed to request voice session: \(error.localizedDescription)")
        }
    }
    
    /// Send mood check-in to iPhone
    func sendMoodCheckIn(mood: String) {
        // Save locally first
        defaults?.set(mood, forKey: "lastMood")
        defaults?.set(Date(), forKey: "lastCheckIn")
        
        let message: [String: Any] = [
            MessageKey.action: "moodCheckIn",
            MessageKey.mood: mood
        ]
        
        if session.isReachable {
            session.sendMessage(message, replyHandler: { [weak self] response in
                DispatchQueue.main.async {
                    if let streak = response["streak"] as? Int {
                        self?.streakDays = streak
                        self?.defaults?.set(streak, forKey: "checkInStreak")
                    }
                }
            }) { error in
                print("Failed to send mood: \(error.localizedDescription)")
            }
        } else {
            // Queue for later via application context
            updateApplicationContext(mood: mood)
        }
    }
    
    /// Request quick vent session
    func requestQuickVent() {
        requestVoiceSession(context: "vent")
    }
    
    /// Request calming music
    func requestCalmingMusic() {
        guard session.isReachable else { return }
        
        let message: [String: Any] = [
            MessageKey.action: "playCalming"
        ]
        
        session.sendMessage(message, replyHandler: nil) { error in
            print("Failed to request music: \(error.localizedDescription)")
        }
    }
    
    /// Request current status from iPhone
    func requestStatus() {
        guard session.isReachable else { return }
        
        let message: [String: Any] = [
            MessageKey.action: "requestStatus"
        ]
        
        session.sendMessage(message, replyHandler: { [weak self] response in
            DispatchQueue.main.async {
                if let state = response[MessageKey.voiceState] as? String {
                    self?.voiceState = state
                }
                if let personaId = response[MessageKey.personaId] as? String {
                    self?.currentPersonaId = personaId
                }
                if let personaName = response[MessageKey.personaName] as? String {
                    self?.currentPersonaName = personaName
                }
                if let streak = response[MessageKey.streakDays] as? Int {
                    self?.streakDays = streak
                }
            }
        }) { error in
            print("Failed to request status: \(error.localizedDescription)")
        }
    }
    
    // MARK: - Application Context (Background Sync)
    
    private func updateApplicationContext(mood: String? = nil) {
        var context: [String: Any] = [:]
        
        if let mood = mood {
            context[MessageKey.mood] = mood
        }
        
        context["timestamp"] = Date().timeIntervalSince1970
        
        do {
            try session.updateApplicationContext(context)
        } catch {
            print("Failed to update context: \(error.localizedDescription)")
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchConnectivityManager: WCSessionDelegate {
    
    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
            
            if activationState == .activated {
                self.requestStatus()
            }
        }
    }
    
    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
            
            if session.isReachable {
                self.requestStatus()
            }
        }
    }
    
    // MARK: - Receive Messages
    
    func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any]
    ) {
        DispatchQueue.main.async {
            self.handleMessage(message)
        }
    }
    
    func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        DispatchQueue.main.async {
            self.handleMessage(message)
            replyHandler(["received": true])
        }
    }
    
    private func handleMessage(_ message: [String: Any]) {
        guard let action = message[MessageKey.action] as? String else { return }
        
        switch action {
        case "voiceStateUpdate":
            if let state = message[MessageKey.voiceState] as? String {
                voiceState = state
            }
            
        case "personaUpdate":
            if let id = message[MessageKey.personaId] as? String {
                currentPersonaId = id
            }
            if let name = message[MessageKey.personaName] as? String {
                currentPersonaName = name
            }
            
        case "moodAcknowledged":
            if let msg = message["message"] as? String {
                lastAcknowledgment = msg
            }
            
        default:
            break
        }
    }
    
    // MARK: - Receive Application Context
    
    func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        DispatchQueue.main.async {
            if let state = applicationContext[MessageKey.voiceState] as? String {
                self.voiceState = state
            }
            if let personaId = applicationContext[MessageKey.personaId] as? String {
                self.currentPersonaId = personaId
            }
            if let personaName = applicationContext[MessageKey.personaName] as? String {
                self.currentPersonaName = personaName
            }
            if let streak = applicationContext[MessageKey.streakDays] as? Int {
                self.streakDays = streak
            }
            if let subscribed = applicationContext[MessageKey.isSubscribed] as? Bool {
                self.isSubscribed = subscribed
            }
        }
    }
    
    // MARK: - Receive Complication Data
    
    func session(
        _ session: WCSession,
        didReceiveUserInfo userInfo: [String: Any]
    ) {
        // Handle complication updates
        if userInfo["complicationData"] as? Bool == true {
            DispatchQueue.main.async {
                if let mood = userInfo["mood"] as? String {
                    self.defaults?.set(mood, forKey: "lastMood")
                }
                if let streak = userInfo[MessageKey.streakDays] as? Int {
                    self.streakDays = streak
                }
            }
        }
    }
}
