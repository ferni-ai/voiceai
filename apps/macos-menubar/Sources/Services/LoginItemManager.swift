import Foundation
import ServiceManagement

// MARK: - Login Item Manager

/// Manages launching Ferni Voice at login using SMAppService (macOS 13+)
class LoginItemManager: ObservableObject {
    static let shared = LoginItemManager()
    
    @Published private(set) var isEnabled: Bool = false
    
    private init() {
        checkStatus()
    }
    
    /// Check if the app is set to launch at login
    func checkStatus() {
        if #available(macOS 13.0, *) {
            let status = SMAppService.mainApp.status
            isEnabled = (status == .enabled)
        } else {
            // Fallback for older macOS (shouldn't happen since we require 13.0)
            isEnabled = false
        }
    }
    
    /// Enable or disable launch at login
    func setEnabled(_ enabled: Bool) {
        if #available(macOS 13.0, *) {
            do {
                if enabled {
                    try SMAppService.mainApp.register()
                    print("[LoginItem] ✓ Registered for launch at login")
                } else {
                    try SMAppService.mainApp.unregister()
                    print("[LoginItem] ✓ Unregistered from launch at login")
                }
                isEnabled = enabled
            } catch {
                print("[LoginItem] ✗ Failed to \(enabled ? "register" : "unregister"): \(error)")
            }
        }
    }
    
    /// Toggle launch at login
    func toggle() {
        setEnabled(!isEnabled)
    }
}

