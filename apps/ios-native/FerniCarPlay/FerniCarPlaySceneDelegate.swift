//
//  FerniCarPlaySceneDelegate.swift
//  FerniVoice
//
//  CarPlay integration for voice-only driving companionship.
//  Ferni becomes your co-pilot for commutes and road trips.
//
//  🚗 SUPERHUMAN CAPABILITIES:
//  - Voice-only interface (no visual distraction)
//  - Commute companionship
//  - Road trip conversations
//  - Quick mood check-ins
//  - Calming support for traffic stress
//

import CarPlay
import UIKit
import Combine

// MARK: - CarPlay Scene Delegate

final class FerniCarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    
    // MARK: - Properties
    
    private var interfaceController: CPInterfaceController?
    private var cancellables = Set<AnyCancellable>()
    
    /// Voice session state (synced with main app)
    private var isVoiceActive = false
    
    /// Current Ferni message
    private var currentMessage = "Hey! Ready to chat?"
    
    // MARK: - Scene Lifecycle
    
    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        self.interfaceController = interfaceController
        
        // Set the root template
        let rootTemplate = createRootTemplate()
        interfaceController.setRootTemplate(rootTemplate, animated: false, completion: nil)
        
        // Listen for voice state changes from main app
        setupAppCommunication()
    }
    
    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnect interfaceController: CPInterfaceController
    ) {
        self.interfaceController = nil
        cancellables.removeAll()
    }
    
    // MARK: - Root Template
    
    private func createRootTemplate() -> CPTemplate {
        // Use a voice template for minimal distraction
        let voiceTemplate = CPVoiceControlTemplate(voiceControlStates: createVoiceStates())
        return voiceTemplate
    }
    
    private func createVoiceStates() -> [CPVoiceControlState] {
        // Idle state - tap to talk
        let idleState = CPVoiceControlState(
            identifier: "idle",
            titleVariants: ["Tap to Talk", "Hey Ferni"],
            image: UIImage(systemName: "mic.fill"),
            repeats: false
        )
        
        // Listening state - Ferni is listening
        let listeningState = CPVoiceControlState(
            identifier: "listening",
            titleVariants: ["Listening...", "I'm here"],
            image: UIImage(systemName: "ear.fill"),
            repeats: false
        )
        
        // Speaking state - Ferni is responding
        let speakingState = CPVoiceControlState(
            identifier: "speaking",
            titleVariants: ["Speaking...", "Ferni"],
            image: UIImage(systemName: "waveform"),
            repeats: false
        )
        
        return [idleState, listeningState, speakingState]
    }
    
    // MARK: - Quick Actions Grid (Alternative UI)
    
    private func createGridTemplate() -> CPGridTemplate {
        // Talk to Ferni
        let talkItem = CPGridButton(
            titleVariants: ["Talk to Ferni"],
            image: UIImage(systemName: "mic.fill")!
        ) { [weak self] _ in
            self?.startVoiceConversation()
        }
        
        // Quick check-in
        let checkInItem = CPGridButton(
            titleVariants: ["Quick Check-in"],
            image: UIImage(systemName: "heart.fill")!
        ) { [weak self] _ in
            self?.startQuickCheckIn()
        }
        
        // Calming moment
        let calmItem = CPGridButton(
            titleVariants: ["Calm Me Down"],
            image: UIImage(systemName: "leaf.fill")!
        ) { [weak self] _ in
            self?.startCalmingMoment()
        }
        
        // Play calming music
        let musicItem = CPGridButton(
            titleVariants: ["Calming Music"],
            image: UIImage(systemName: "music.note")!
        ) { [weak self] _ in
            self?.playCalmingMusic()
        }
        
        return CPGridTemplate(
            title: "Ferni",
            gridButtons: [talkItem, checkInItem, calmItem, musicItem]
        )
    }
    
    // MARK: - List Template (Status View)
    
    private func createStatusTemplate() -> CPListTemplate {
        // Current status section
        let statusItem = CPListItem(
            text: currentMessage,
            detailText: isVoiceActive ? "Voice active" : "Tap to talk"
        )
        statusItem.handler = { [weak self] _, completion in
            self?.startVoiceConversation()
            completion()
        }
        
        let statusSection = CPListSection(items: [statusItem])
        
        // Quick actions section
        let checkInItem = CPListItem(
            text: "Quick Check-in",
            detailText: "How are you feeling?"
        )
        checkInItem.handler = { [weak self] _, completion in
            self?.startQuickCheckIn()
            completion()
        }
        
        let calmItem = CPListItem(
            text: "Calm Me Down",
            detailText: "Breathing exercise"
        )
        calmItem.handler = { [weak self] _, completion in
            self?.startCalmingMoment()
            completion()
        }
        
        let actionsSection = CPListSection(
            items: [checkInItem, calmItem],
            header: "Quick Actions",
            sectionIndexTitle: nil
        )
        
        return CPListTemplate(
            title: "Ferni",
            sections: [statusSection, actionsSection]
        )
    }
    
    // MARK: - Voice Actions
    
    private func startVoiceConversation() {
        // Notify main app to start voice session
        NotificationCenter.default.post(
            name: .ferniCarPlayStartVoice,
            object: nil,
            userInfo: ["context": "driving"]
        )
        
        // Update UI to listening state
        updateVoiceState(to: "listening")
    }
    
    private func startQuickCheckIn() {
        // Start with a mood check-in prompt
        NotificationCenter.default.post(
            name: .ferniCarPlayStartVoice,
            object: nil,
            userInfo: ["context": "checkin", "prompt": "How are you feeling on your drive?"]
        )
        
        updateVoiceState(to: "listening")
    }
    
    private func startCalmingMoment() {
        // Start calming conversation
        NotificationCenter.default.post(
            name: .ferniCarPlayStartVoice,
            object: nil,
            userInfo: ["context": "calming", "prompt": "Let's take a calming breath together"]
        )
        
        updateVoiceState(to: "speaking")
    }
    
    private func playCalmingMusic() {
        // Tell main app to play calming music
        NotificationCenter.default.post(
            name: .ferniCarPlayPlayMusic,
            object: nil,
            userInfo: ["mood": "calming"]
        )
    }
    
    // MARK: - Voice State Updates
    
    private func updateVoiceState(to state: String) {
        guard let voiceTemplate = interfaceController?.topTemplate as? CPVoiceControlTemplate else {
            return
        }
        
        voiceTemplate.activateVoiceControlState(withIdentifier: state)
    }
    
    // MARK: - App Communication
    
    private func setupAppCommunication() {
        // Listen for voice state updates from main app
        NotificationCenter.default.publisher(for: .ferniVoiceStateChanged)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                if let state = notification.userInfo?["state"] as? String {
                    self?.handleVoiceStateChange(state)
                }
            }
            .store(in: &cancellables)
        
        // Listen for message updates
        NotificationCenter.default.publisher(for: .ferniMessageUpdated)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                if let message = notification.userInfo?["message"] as? String {
                    self?.currentMessage = message
                    self?.refreshStatusTemplate()
                }
            }
            .store(in: &cancellables)
    }
    
    private func handleVoiceStateChange(_ state: String) {
        switch state {
        case "connected", "listening":
            isVoiceActive = true
            updateVoiceState(to: "listening")
        case "speaking":
            isVoiceActive = true
            updateVoiceState(to: "speaking")
        case "disconnected":
            isVoiceActive = false
            updateVoiceState(to: "idle")
        default:
            break
        }
    }
    
    private func refreshStatusTemplate() {
        // Only refresh if using list template
        if let listTemplate = interfaceController?.topTemplate as? CPListTemplate {
            // Update the template
            let newTemplate = createStatusTemplate()
            interfaceController?.setRootTemplate(newTemplate, animated: true, completion: nil)
        }
    }
}

// MARK: - Notification Names

extension Notification.Name {
    /// Posted when CarPlay wants to start a voice conversation
    static let ferniCarPlayStartVoice = Notification.Name("ferniCarPlayStartVoice")
    
    /// Posted when CarPlay wants to play music
    static let ferniCarPlayPlayMusic = Notification.Name("ferniCarPlayPlayMusic")
    
    /// Posted by main app when voice state changes
    static let ferniVoiceStateChanged = Notification.Name("ferniVoiceStateChanged")
    
    /// Posted by main app when Ferni's message updates
    static let ferniMessageUpdated = Notification.Name("ferniMessageUpdated")
}

// MARK: - CarPlay Integration Service

/// Service to bridge CarPlay with the main app's voice session
final class CarPlayIntegrationService: ObservableObject {
    static let shared = CarPlayIntegrationService()
    
    @Published var isCarPlayConnected = false
    @Published var carPlayContext: String?
    
    private var cancellables = Set<AnyCancellable>()
    
    private init() {
        setupListeners()
    }
    
    private func setupListeners() {
        // Listen for CarPlay voice requests
        NotificationCenter.default.publisher(for: .ferniCarPlayStartVoice)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                let context = notification.userInfo?["context"] as? String
                let prompt = notification.userInfo?["prompt"] as? String
                self?.handleCarPlayVoiceRequest(context: context, prompt: prompt)
            }
            .store(in: &cancellables)
        
        // Listen for CarPlay music requests
        NotificationCenter.default.publisher(for: .ferniCarPlayPlayMusic)
            .receive(on: DispatchQueue.main)
            .sink { notification in
                let mood = notification.userInfo?["mood"] as? String
                self.handleCarPlayMusicRequest(mood: mood)
            }
            .store(in: &cancellables)
    }
    
    private func handleCarPlayVoiceRequest(context: String?, prompt: String?) {
        carPlayContext = context
        
        // Trigger voice session start in main app
        // This will be handled by the voice session manager
        NotificationCenter.default.post(
            name: Notification.Name("startVoiceSession"),
            object: nil,
            userInfo: [
                "source": "carplay",
                "context": context ?? "driving",
                "prompt": prompt ?? ""
            ]
        )
    }
    
    private func handleCarPlayMusicRequest(mood: String?) {
        // Trigger music playback via MusicKit
        NotificationCenter.default.post(
            name: Notification.Name("playMusic"),
            object: nil,
            userInfo: ["mood": mood ?? "calming"]
        )
    }
    
    /// Notify CarPlay of voice state changes
    func notifyVoiceStateChanged(_ state: String) {
        NotificationCenter.default.post(
            name: .ferniVoiceStateChanged,
            object: nil,
            userInfo: ["state": state]
        )
    }
    
    /// Notify CarPlay of message updates
    func notifyMessageUpdated(_ message: String) {
        NotificationCenter.default.post(
            name: .ferniMessageUpdated,
            object: nil,
            userInfo: ["message": message]
        )
    }
}
