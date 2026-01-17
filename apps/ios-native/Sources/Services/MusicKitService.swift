import Foundation
import MusicKit
import os

/// MusicKit service for mood-aware music playback
/// Enables "Better Than Human" music selection based on emotional state
@MainActor
final class MusicKitService: ObservableObject {
    static let shared = MusicKitService()

    // MARK: - Published State

    @Published private(set) var isAuthorized: Bool = false
    @Published private(set) var isPlaying: Bool = false
    @Published private(set) var currentTrack: Song?
    @Published private(set) var currentMood: MusicMood = .neutral

    // MARK: - Private

    private let logger = Logger(subsystem: "com.ferni.FerniVoice", category: "MusicKit")
    private let player = ApplicationMusicPlayer.shared

    // MARK: - Mood Types

    enum MusicMood: String, CaseIterable {
        case energizing = "energizing"
        case calming = "calming"
        case focusing = "focusing"
        case uplifting = "uplifting"
        case reflective = "reflective"
        case neutral = "neutral"

        var searchTerms: [String] {
            switch self {
            case .energizing: return ["upbeat", "energetic", "workout", "motivation"]
            case .calming: return ["calm", "peaceful", "relaxing", "ambient"]
            case .focusing: return ["focus", "concentration", "instrumental", "lo-fi"]
            case .uplifting: return ["happy", "joyful", "feel good", "positive"]
            case .reflective: return ["emotional", "acoustic", "indie", "thoughtful"]
            case .neutral: return ["popular", "chill", "easy listening"]
            }
        }

        var appleMusicPlaylistIds: [String] {
            // Apple Music curated playlist IDs for each mood
            switch self {
            case .energizing: return ["pl.2b0e6e332fdf4b7a91164da3162127b5"] // Pure Workout
            case .calming: return ["pl.0ef4d5afc3854ee3bd686bb1af7b5e75"] // Pure Relax
            case .focusing: return ["pl.4470e5a3f3ed4ec3a8c3e6b24e8c4d5f"] // Pure Focus
            case .uplifting: return ["pl.567c541f63414e798be5cf214e155557"] // Feel Good
            case .reflective: return ["pl.2613394146f64229bb8b9e8d1b5c6a21"] // Acoustic Chill
            case .neutral: return ["pl.5ee8333dbe944d9f9151e97d92d1ead9"] // Today's Hits
            }
        }
    }

    // MARK: - Initialization

    private init() {
        Task {
            await checkAuthorization()
        }
    }

    // MARK: - Authorization

    func requestAuthorization() async -> Bool {
        let status = await MusicAuthorization.request()
        isAuthorized = status == .authorized

        if isAuthorized {
            logger.info("MusicKit authorization granted")
        } else {
            logger.warning("MusicKit authorization denied: \(String(describing: status))")
        }

        return isAuthorized
    }

    func checkAuthorization() async {
        let status = MusicAuthorization.currentStatus
        isAuthorized = status == .authorized
    }

    // MARK: - Mood-Based Playback (Better Than Human)

    /// Play music matching the user's emotional state
    /// This is "Better Than Human" because Ferni can sense mood from voice/conversation
    func playForMood(_ mood: MusicMood) async {
        guard isAuthorized else {
            logger.warning("Cannot play music - not authorized")
            return
        }

        currentMood = mood
        logger.info("Playing music for mood: \(mood.rawValue)")

        do {
            // Search for mood-appropriate music
            let searchTerm = mood.searchTerms.randomElement() ?? "chill"
            var request = MusicCatalogSearchRequest(term: searchTerm, types: [Playlist.self])
            request.limit = 5

            let response = try await request.response()

            if let playlist = response.playlists.first {
                try await playPlaylist(playlist)
            } else {
                // Fallback to searching for songs
                await playSearchResults(for: searchTerm)
            }
        } catch {
            logger.error("Failed to play mood music: \(error.localizedDescription)")
        }
    }

    /// Play calming music - quick access for stress moments
    func playCalming() async {
        await playForMood(.calming)
    }

    /// Play energizing music - for motivation
    func playEnergizing() async {
        await playForMood(.energizing)
    }

    /// Play focusing music - for concentration
    func playFocusing() async {
        await playForMood(.focusing)
    }

    // MARK: - Playback Control

    func play() async {
        do {
            try await player.play()
            isPlaying = true
            logger.info("Music playback started")
        } catch {
            logger.error("Failed to start playback: \(error.localizedDescription)")
        }
    }

    func pause() {
        player.pause()
        isPlaying = false
        logger.info("Music playback paused")
    }

    func skip() async {
        do {
            try await player.skipToNextEntry()
            logger.info("Skipped to next track")
        } catch {
            logger.error("Failed to skip: \(error.localizedDescription)")
        }
    }

    func previous() async {
        do {
            try await player.skipToPreviousEntry()
            logger.info("Skipped to previous track")
        } catch {
            logger.error("Failed to go back: \(error.localizedDescription)")
        }
    }

    func setVolume(_ volume: Float) {
        // Volume is controlled at system level on iOS
        // This is a placeholder for future implementation
    }

    // MARK: - Search & Play

    func searchAndPlay(query: String) async {
        guard isAuthorized else { return }

        do {
            var request = MusicCatalogSearchRequest(term: query, types: [Song.self])
            request.limit = 25

            let response = try await request.response()

            if !response.songs.isEmpty {
                player.queue = ApplicationMusicPlayer.Queue(for: response.songs)
                try await player.play()
                isPlaying = true

                if let first = response.songs.first {
                    currentTrack = first
                    logger.info("Now playing: \(first.title) by \(first.artistName)")
                }
            }
        } catch {
            logger.error("Search failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Library Access

    func getRecentlyPlayed() async -> [Track] {
        guard isAuthorized else { return [] }

        do {
            var request = MusicRecentlyPlayedRequest<Track>()
            request.limit = 10
            let response = try await request.response()
            return Array(response.items)
        } catch {
            logger.error("Failed to get recently played: \(error.localizedDescription)")
            return []
        }
    }

    func getUserPlaylists() async -> [Playlist] {
        guard isAuthorized else { return [] }

        do {
            var request = MusicLibraryRequest<Playlist>()
            request.limit = 50
            let response = try await request.response()
            return Array(response.items)
        } catch {
            logger.error("Failed to get playlists: \(error.localizedDescription)")
            return []
        }
    }

    // MARK: - Private Helpers

    private func playPlaylist(_ playlist: Playlist) async throws {
        player.queue = ApplicationMusicPlayer.Queue(for: [playlist])
        try await player.play()
        isPlaying = true
        logger.info("Playing playlist: \(playlist.name)")
    }

    private func playSearchResults(for query: String) async {
        do {
            var request = MusicCatalogSearchRequest(term: query, types: [Song.self])
            request.limit = 25

            let response = try await request.response()

            if !response.songs.isEmpty {
                player.queue = ApplicationMusicPlayer.Queue(for: response.songs)
                try await player.play()
                isPlaying = true
            }
        } catch {
            logger.error("Failed to play search results: \(error.localizedDescription)")
        }
    }
}

// MARK: - Voice Agent Integration

extension MusicKitService {
    /// Called by voice agent when mood is detected from conversation
    func onMoodDetected(_ moodString: String) async {
        let mood = MusicMood(rawValue: moodString.lowercased()) ?? .neutral
        await playForMood(mood)
    }

    /// Get current playback state for voice agent context
    func getPlaybackContext() -> [String: Any] {
        return [
            "isPlaying": isPlaying,
            "currentMood": currentMood.rawValue,
            "currentTrack": currentTrack?.title ?? "None",
            "currentArtist": currentTrack?.artistName ?? "Unknown"
        ]
    }
}
