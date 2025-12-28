//
//  FerniApp.swift
//  Ferni
//
//  The main entry point for the Ferni iOS app.
//
//  "Better than Human" - This app enables superhuman awareness
//  by connecting iOS system capabilities with Ferni's AI.
//

import SwiftUI

@main
struct FerniApp: App {
    // MARK: - Environment
    
    @StateObject private var appState = AppState()
    @StateObject private var permissionManager = PermissionManager()
    @StateObject private var voiceSessionManager = VoiceSessionManager()
    
    // MARK: - Scene
    
    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .environmentObject(permissionManager)
                .environmentObject(voiceSessionManager)
                .preferredColorScheme(appState.colorScheme)
                .onAppear {
                    setupApp()
                }
        }
    }
    
    // MARK: - Setup
    
    private func setupApp() {
        // Configure appearance
        configureAppearance()
        
        // Initialize services
        Task {
            await initializeServices()
        }
    }
    
    private func configureAppearance() {
        // Configure navigation bar appearance
        let navBarAppearance = UINavigationBarAppearance()
        navBarAppearance.configureWithOpaqueBackground()
        navBarAppearance.backgroundColor = UIColor(FerniColors.backgroundElevated)
        navBarAppearance.titleTextAttributes = [
            .foregroundColor: UIColor(FerniColors.textPrimary),
            .font: UIFont(name: "PlusJakartaSans-SemiBold", size: 17) ?? .systemFont(ofSize: 17, weight: .semibold)
        ]
        
        UINavigationBar.appearance().standardAppearance = navBarAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navBarAppearance
        
        // Configure tab bar appearance
        let tabBarAppearance = UITabBarAppearance()
        tabBarAppearance.configureWithOpaqueBackground()
        tabBarAppearance.backgroundColor = UIColor(FerniColors.backgroundElevated)
        
        UITabBar.appearance().standardAppearance = tabBarAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabBarAppearance
    }
    
    private func initializeServices() async {
        // Load persisted state
        await appState.loadPersistedState()
        
        // Check permission statuses
        await permissionManager.checkAllStatuses()
        
        // Initialize voice session if user is authenticated
        if appState.isAuthenticated {
            await voiceSessionManager.initialize()
        }
    }
}

// MARK: - Shared Instance for Deep Links and Shortcuts

extension FerniApp {
    static var shared: FerniApp {
        // Access shared instance for Siri shortcuts and deep links
        // This is set up during app initialization
        FerniApp()
    }
    
    func startConversation(topic: String? = nil) {
        // Handle deep link to start conversation
        NotificationCenter.default.post(
            name: .startConversation,
            object: nil,
            userInfo: topic.map { ["topic": $0] }
        )
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let startConversation = Notification.Name("com.ferni.startConversation")
    static let endConversation = Notification.Name("com.ferni.endConversation")
    static let personaChanged = Notification.Name("com.ferni.personaChanged")
    static let healthDataUpdated = Notification.Name("com.ferni.healthDataUpdated")
    static let locationChanged = Notification.Name("com.ferni.locationChanged")
}
