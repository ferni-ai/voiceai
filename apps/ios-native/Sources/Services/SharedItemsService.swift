//
//  SharedItemsService.swift
//  FerniVoice
//
//  Service to retrieve and manage items shared via the Share Extension.
//  Ferni can reference these in conversations.
//
//  🎯 USAGE:
//  - User shares article from Safari → stored in App Group
//  - User opens Ferni → service loads items
//  - During conversation, Ferni can reference: "I saw you saved an article about..."
//

import Foundation
import Combine

// MARK: - Shared Items Service

final class SharedItemsService: ObservableObject {
    static let shared = SharedItemsService()
    
    // MARK: - Published State
    
    @Published private(set) var items: [SharedItem] = []
    @Published private(set) var unreadCount: Int = 0
    
    // MARK: - Private
    
    private let defaults = UserDefaults(suiteName: "group.com.ferni.shared")
    private let itemsKey = "sharedItems"
    private let lastReadKey = "lastReadSharedItems"
    
    // MARK: - Initialization
    
    private init() {
        loadItems()
    }
    
    // MARK: - Load Items
    
    func loadItems() {
        guard let data = defaults?.data(forKey: itemsKey),
              let decoded = try? JSONDecoder().decode([SharedItem].self, from: data) else {
            items = []
            return
        }
        
        items = decoded
        updateUnreadCount()
    }
    
    // MARK: - Get Items by Category
    
    func items(for category: ContentCategory) -> [SharedItem] {
        items.filter { $0.category == category }
    }
    
    func recentItems(limit: Int = 10) -> [SharedItem] {
        Array(items.prefix(limit))
    }
    
    func itemsFromToday() -> [SharedItem] {
        let calendar = Calendar.current
        return items.filter { calendar.isDateInToday($0.timestamp) }
    }
    
    // MARK: - Get Specific Item
    
    func item(withId id: String) -> SharedItem? {
        items.first { $0.id == id }
    }
    
    // MARK: - Mark as Read
    
    func markAllAsRead() {
        defaults?.set(Date(), forKey: lastReadKey)
        updateUnreadCount()
    }
    
    func markItemAsRead(_ id: String) {
        // Track individual reads if needed
    }
    
    private func updateUnreadCount() {
        guard let lastRead = defaults?.object(forKey: lastReadKey) as? Date else {
            unreadCount = items.count
            return
        }
        
        unreadCount = items.filter { $0.timestamp > lastRead }.count
    }
    
    // MARK: - Delete Item
    
    func deleteItem(_ id: String) {
        items.removeAll { $0.id == id }
        saveItems()
    }
    
    func deleteAllItems() {
        items = []
        saveItems()
    }
    
    private func saveItems() {
        if let encoded = try? JSONEncoder().encode(items) {
            defaults?.set(encoded, forKey: itemsKey)
        }
    }
    
    // MARK: - Voice Agent Context
    
    /// Generate context for the voice agent about recent shared items
    func getVoiceAgentContext() -> String {
        let recent = recentItems(limit: 5)
        guard !recent.isEmpty else { return "" }
        
        var context = "RECENTLY SHARED ITEMS:\n"
        
        for item in recent {
            let timeAgo = relativeTimeString(from: item.timestamp)
            
            switch item.type {
            case .url:
                if let url = item.url {
                    context += "- [Link] \(url) (\(timeAgo))"
                    if let note = item.note {
                        context += " Note: \"\(note)\""
                    }
                    context += "\n"
                }
            case .text:
                if let text = item.text {
                    let preview = String(text.prefix(100))
                    context += "- [Text] \"\(preview)\" (\(timeAgo))"
                    if let note = item.note {
                        context += " Note: \"\(note)\""
                    }
                    context += "\n"
                }
            case .image:
                context += "- [Image] shared (\(timeAgo))"
                if let note = item.note {
                    context += " Note: \"\(note)\""
                }
                context += "\n"
            }
        }
        
        return context
    }
    
    private func relativeTimeString(from date: Date) -> String {
        let interval = Date().timeIntervalSince(date)
        
        if interval < 60 {
            return "just now"
        } else if interval < 3600 {
            let minutes = Int(interval / 60)
            return "\(minutes)m ago"
        } else if interval < 86400 {
            let hours = Int(interval / 3600)
            return "\(hours)h ago"
        } else {
            let days = Int(interval / 86400)
            return "\(days)d ago"
        }
    }
    
    // MARK: - Suggestions for Conversation
    
    /// Get conversation starters based on shared items
    func getConversationStarters() -> [String] {
        var starters: [String] = []
        
        // Check for inspiration items
        let inspirationItems = items(for: .inspiration)
        if !inspirationItems.isEmpty {
            starters.append("I noticed you saved some inspiration - want to talk about what resonated with you?")
        }
        
        // Check for items to discuss
        let discussItems = items(for: .discuss)
        if !discussItems.isEmpty {
            starters.append("You had something you wanted to discuss - ready to dive in?")
        }
        
        // Check for recent items
        let todayItems = itemsFromToday()
        if !todayItems.isEmpty {
            starters.append("I see you saved something today. What caught your attention?")
        }
        
        return starters
    }
}

// MARK: - Types (imported from Share Extension)

struct SharedItem: Codable, Identifiable {
    let id: String
    let type: ContentType
    let url: String?
    let text: String?
    let note: String?
    let category: ContentCategory
    let timestamp: Date
}

enum ContentType: String, Codable {
    case url
    case text
    case image
}

enum ContentCategory: Int, Codable {
    case general = 0
    case inspiration = 1
    case discuss = 2
    case remember = 3
    case journal = 4
    
    var displayName: String {
        switch self {
        case .general: return "General"
        case .inspiration: return "Inspiration"
        case .discuss: return "Discuss"
        case .remember: return "Remember"
        case .journal: return "Journal"
        }
    }
}
