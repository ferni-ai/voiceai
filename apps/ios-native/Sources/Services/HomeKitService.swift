import Foundation
import HomeKit
import os

/// HomeKit service for ambient environment control
/// Creates "Better Than Human" experiences by adjusting environment based on emotional state
@MainActor
final class HomeKitService: NSObject, ObservableObject {
    static let shared = HomeKitService()

    // MARK: - Published State

    @Published private(set) var isAuthorized: Bool = false
    @Published private(set) var homes: [HMHome] = []
    @Published private(set) var currentHome: HMHome?
    @Published private(set) var isSettingScene: Bool = false

    // MARK: - Ambient Scenes

    enum AmbientScene: String, CaseIterable {
        case calming = "calming"
        case energizing = "energizing"
        case focusing = "focusing"
        case sleepy = "sleepy"
        case cozy = "cozy"
        case neutral = "neutral"

        var lightSettings: (brightness: Int, temperature: Int) {
            // Brightness 0-100, Temperature in Kelvin (2700=warm, 6500=cool)
            switch self {
            case .calming: return (40, 2700)      // Dim, warm
            case .energizing: return (100, 5000)  // Bright, daylight
            case .focusing: return (70, 4000)     // Medium, neutral
            case .sleepy: return (10, 2200)       // Very dim, very warm
            case .cozy: return (50, 2700)         // Medium, warm
            case .neutral: return (80, 4000)      // Bright, neutral
            }
        }

        var description: String {
            switch self {
            case .calming: return "Dim, warm lighting to help you relax"
            case .energizing: return "Bright, daylight-like lighting"
            case .focusing: return "Balanced lighting for concentration"
            case .sleepy: return "Very dim, warm lighting for bedtime"
            case .cozy: return "Warm, comfortable lighting"
            case .neutral: return "Standard lighting"
            }
        }
    }

    // MARK: - Private

    private let homeManager = HMHomeManager()
    private let logger = Logger(subsystem: "com.ferni.FerniVoice", category: "HomeKit")

    // MARK: - Initialization

    private override init() {
        super.init()
        homeManager.delegate = self
    }

    // MARK: - Authorization

    /// Request HomeKit access
    func requestAccess() async {
        // HomeKit authorization happens automatically when we access homes
        // Just wait for the delegate callback
        logger.info("Requesting HomeKit access")

        // Trigger authorization by accessing homes
        _ = homeManager.homes
    }

    // MARK: - Scene Control (Better Than Human)

    /// Set ambient lighting based on emotional state
    /// This is "Better Than Human" because Ferni detects mood from voice
    func setAmbientScene(_ scene: AmbientScene) async {
        guard let home = currentHome else {
            logger.warning("No home selected for ambient scene")
            return
        }

        isSettingScene = true
        defer { isSettingScene = false }

        logger.info("Setting ambient scene: \(scene.rawValue)")

        let settings = scene.lightSettings

        // Find all lights in the home
        for room in home.rooms {
            for accessory in room.accessories {
                await setLightSettings(accessory, brightness: settings.brightness, temperature: settings.temperature)
            }
        }
    }

    /// Set calming scene - quick access for stress moments
    func setCalming() async {
        await setAmbientScene(.calming)
    }

    /// Set sleepy scene - for bedtime
    func setSleepy() async {
        await setAmbientScene(.sleepy)
    }

    /// Set energizing scene - for morning or motivation
    func setEnergizing() async {
        await setAmbientScene(.energizing)
    }

    // MARK: - Device Control

    /// Turn on/off a specific accessory by name
    func setAccessoryPower(named name: String, on: Bool) async -> Bool {
        guard let home = currentHome else { return false }

        for room in home.rooms {
            for accessory in room.accessories {
                if accessory.name.lowercased().contains(name.lowercased()) {
                    return await setPower(accessory, on: on)
                }
            }
        }

        logger.warning("Accessory not found: \(name)")
        return false
    }

    /// Dim lights to a specific level (0-100)
    func dimLights(to level: Int, inRoom roomName: String? = nil) async {
        guard let home = currentHome else { return }

        let rooms: [HMRoom]
        if let roomName = roomName {
            rooms = home.rooms.filter { $0.name.lowercased().contains(roomName.lowercased()) }
        } else {
            rooms = home.rooms
        }

        for room in rooms {
            for accessory in room.accessories {
                await setLightSettings(accessory, brightness: level, temperature: nil)
            }
        }
    }

    // MARK: - Room & Accessory Discovery

    /// Get all rooms in the current home
    func getRooms() -> [String] {
        guard let home = currentHome else { return [] }
        return home.rooms.map { $0.name }
    }

    /// Get all accessories in a room
    func getAccessories(inRoom roomName: String) -> [String] {
        guard let home = currentHome,
              let room = home.rooms.first(where: { $0.name.lowercased() == roomName.lowercased() }) else {
            return []
        }
        return room.accessories.map { $0.name }
    }

    /// Get all light accessories
    func getLights() -> [(name: String, room: String, isOn: Bool)] {
        guard let home = currentHome else { return [] }

        var lights: [(name: String, room: String, isOn: Bool)] = []

        for room in home.rooms {
            for accessory in room.accessories {
                if isLightAccessory(accessory) {
                    let isOn = getPowerState(accessory)
                    lights.append((accessory.name, room.name, isOn))
                }
            }
        }

        return lights
    }

    // MARK: - Private Helpers

    private func setLightSettings(_ accessory: HMAccessory, brightness: Int?, temperature: Int?) async {
        guard isLightAccessory(accessory) else { return }

        for service in accessory.services {
            for characteristic in service.characteristics {
                do {
                    // Set power on first if setting brightness
                    if characteristic.characteristicType == HMCharacteristicTypePowerState,
                       brightness != nil && brightness! > 0 {
                        try await characteristic.writeValue(true)
                    }

                    // Set brightness
                    if characteristic.characteristicType == HMCharacteristicTypeBrightness,
                       let brightness = brightness {
                        try await characteristic.writeValue(brightness)
                    }

                    // Set color temperature if supported
                    if characteristic.characteristicType == HMCharacteristicTypeColorTemperature,
                       let temperature = temperature {
                        // Convert Kelvin to Mired (HomeKit uses Mired)
                        let mired = 1_000_000 / temperature
                        try await characteristic.writeValue(mired)
                    }
                } catch {
                    logger.error("Failed to set characteristic: \(error.localizedDescription)")
                }
            }
        }
    }

    private func setPower(_ accessory: HMAccessory, on: Bool) async -> Bool {
        for service in accessory.services {
            for characteristic in service.characteristics {
                if characteristic.characteristicType == HMCharacteristicTypePowerState {
                    do {
                        try await characteristic.writeValue(on)
                        return true
                    } catch {
                        logger.error("Failed to set power: \(error.localizedDescription)")
                        return false
                    }
                }
            }
        }
        return false
    }

    private func getPowerState(_ accessory: HMAccessory) -> Bool {
        for service in accessory.services {
            for characteristic in service.characteristics {
                if characteristic.characteristicType == HMCharacteristicTypePowerState,
                   let value = characteristic.value as? Bool {
                    return value
                }
            }
        }
        return false
    }

    private func isLightAccessory(_ accessory: HMAccessory) -> Bool {
        for service in accessory.services {
            if service.serviceType == HMServiceTypeLightbulb {
                return true
            }
        }
        return false
    }
}

// MARK: - HMHomeManagerDelegate

extension HomeKitService: HMHomeManagerDelegate {
    nonisolated func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
        Task { @MainActor in
            homes = manager.homes
            currentHome = manager.primaryHome ?? manager.homes.first
            isAuthorized = !manager.homes.isEmpty

            if let home = currentHome {
                logger.info("HomeKit connected: \(home.name)")
            }
        }
    }

    nonisolated func homeManagerDidUpdatePrimaryHome(_ manager: HMHomeManager) {
        Task { @MainActor in
            currentHome = manager.primaryHome
        }
    }
}

// MARK: - Voice Agent Integration

extension HomeKitService {
    /// Called by voice agent when mood is detected from conversation
    func onMoodDetected(_ moodString: String) async {
        let scene: AmbientScene
        switch moodString.lowercased() {
        case "stressed", "anxious", "overwhelmed":
            scene = .calming
        case "tired", "sleepy", "exhausted":
            scene = .sleepy
        case "motivated", "excited", "energetic":
            scene = .energizing
        case "focused", "working", "studying":
            scene = .focusing
        case "relaxed", "content", "peaceful":
            scene = .cozy
        default:
            scene = .neutral
        }

        await setAmbientScene(scene)
    }

    /// Get HomeKit context for voice agent
    func getHomeContext() -> [String: Any] {
        return [
            "isConnected": currentHome != nil,
            "homeName": currentHome?.name ?? "None",
            "roomCount": currentHome?.rooms.count ?? 0,
            "lightCount": getLights().count
        ]
    }
}
