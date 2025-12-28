//
//  CalendarData.swift
//  Ferni
//
//  Calendar-related entities for EventKit integration.
//  Enables proactive preparation and follow-up for life events.
//

import Foundation

// MARK: - Calendar Event

/// A calendar event with semantic understanding
public struct CalendarEvent: Identifiable, Equatable, Hashable {
    public let id: String
    public let title: String
    public let startDate: Date
    public let endDate: Date
    public let location: String?
    public let notes: String?
    public let attendees: [String]
    public let isAllDay: Bool
    public let calendarName: String
    public let semanticType: EventSemanticType
    
    public init(
        id: String = UUID().uuidString,
        title: String,
        startDate: Date,
        endDate: Date,
        location: String? = nil,
        notes: String? = nil,
        attendees: [String] = [],
        isAllDay: Bool = false,
        calendarName: String = "Calendar",
        semanticType: EventSemanticType = .unknown
    ) {
        self.id = id
        self.title = title
        self.startDate = startDate
        self.endDate = endDate
        self.location = location
        self.notes = notes
        self.attendees = attendees
        self.isAllDay = isAllDay
        self.calendarName = calendarName
        self.semanticType = semanticType
    }
    
    /// Duration of the event
    public var duration: TimeInterval {
        endDate.timeIntervalSince(startDate)
    }
    
    /// Whether this event is high-stakes (requires preparation support)
    public var isHighStakes: Bool {
        semanticType.importance == .high
    }
    
    /// Whether this event warrants a follow-up conversation
    public var warrantsFollowUp: Bool {
        switch semanticType {
        case .meeting(let importance) where importance == .high:
            return true
        case .health, .personal(.anniversary), .personal(.birthday):
            return true
        default:
            return false
        }
    }
}

// MARK: - Event Semantic Type

/// Semantic classification of calendar events
public enum EventSemanticType: Equatable, Hashable {
    case meeting(importance: Importance)
    case deadline
    case personal(type: PersonalEventType)
    case travel(type: TravelType)
    case health
    case social
    case recurring(pattern: RecurringPattern)
    case unknown
    
    /// Importance level for this event type
    public var importance: Importance {
        switch self {
        case .meeting(let importance):
            return importance
        case .deadline:
            return .high
        case .personal(let type):
            switch type {
            case .birthday, .anniversary:
                return .medium
            default:
                return .low
            }
        case .travel:
            return .medium
        case .health:
            return .medium
        case .social:
            return .low
        case .recurring:
            return .low
        case .unknown:
            return .low
        }
    }
    
    /// Display name for the event type
    public var displayName: String {
        switch self {
        case .meeting(let importance):
            return importance == .high ? "Important Meeting" : "Meeting"
        case .deadline:
            return "Deadline"
        case .personal(let type):
            return type.displayName
        case .travel(let type):
            return type.displayName
        case .health:
            return "Health Appointment"
        case .social:
            return "Social Event"
        case .recurring(let pattern):
            return "Recurring (\(pattern.rawValue))"
        case .unknown:
            return "Event"
        }
    }
}

// MARK: - Importance Level

/// Importance level for events
public enum Importance: String, Codable, Comparable {
    case low
    case medium
    case high
    
    public static func < (lhs: Importance, rhs: Importance) -> Bool {
        let order: [Importance] = [.low, .medium, .high]
        return order.firstIndex(of: lhs)! < order.firstIndex(of: rhs)!
    }
}

// MARK: - Personal Event Type

/// Types of personal events
public enum PersonalEventType: String, Codable, Hashable {
    case birthday
    case anniversary
    case holiday
    case vacation
    case familyTime
    case selfCare
    case other
    
    public var displayName: String {
        switch self {
        case .birthday: return "Birthday"
        case .anniversary: return "Anniversary"
        case .holiday: return "Holiday"
        case .vacation: return "Vacation"
        case .familyTime: return "Family Time"
        case .selfCare: return "Self Care"
        case .other: return "Personal"
        }
    }
}

// MARK: - Travel Type

/// Types of travel
public enum TravelType: String, Codable, Hashable {
    case flight
    case drive
    case train
    case hotel
    case trip
    
    public var displayName: String {
        switch self {
        case .flight: return "Flight"
        case .drive: return "Drive"
        case .train: return "Train"
        case .hotel: return "Hotel Stay"
        case .trip: return "Trip"
        }
    }
}

// MARK: - Recurring Pattern

/// Pattern for recurring events
public enum RecurringPattern: String, Codable, Hashable {
    case daily
    case weekly
    case biweekly
    case monthly
    case yearly
}

// MARK: - Calendar Context

/// Conversational context built from calendar data
public struct CalendarContext: Equatable {
    public let today: [CalendarEvent]
    public let upcoming: [CalendarEvent] // Next 7 days
    public let density: CalendarDensity
    public let highStakesEvents: [CalendarEvent]
    public let opportunities: [ConversationOpportunity]
    public let timestamp: Date
    
    public init(
        today: [CalendarEvent] = [],
        upcoming: [CalendarEvent] = [],
        density: CalendarDensity = .light,
        highStakesEvents: [CalendarEvent] = [],
        opportunities: [ConversationOpportunity] = [],
        timestamp: Date = Date()
    ) {
        self.today = today
        self.upcoming = upcoming
        self.density = density
        self.highStakesEvents = highStakesEvents
        self.opportunities = opportunities
        self.timestamp = timestamp
    }
    
    /// Generate conversational context for AI
    public var conversationalContext: String {
        var context = "CALENDAR CONTEXT:\n"
        
        // Today's events
        if today.isEmpty {
            context += "- Today: No scheduled events\n"
        } else {
            context += "- Today: \(today.count) events\n"
            for event in today.prefix(3) {
                context += "  • \(event.title) (\(event.semanticType.displayName))\n"
            }
        }
        
        // Week density
        context += "- Week ahead: \(density.displayName)\n"
        
        // High-stakes events
        if !highStakesEvents.isEmpty {
            context += "\nHIGH-STAKES COMING UP:\n"
            for event in highStakesEvents {
                let daysUntil = Calendar.current.dateComponents([.day], from: Date(), to: event.startDate).day ?? 0
                context += "- \(event.title) in \(daysUntil) days\n"
            }
        }
        
        // Opportunities
        if !opportunities.isEmpty {
            context += "\nCONVERSATION OPPORTUNITIES:\n"
            for opp in opportunities {
                context += "- \(opp.topic): \(opp.suggestedOpener)\n"
            }
        }
        
        return context
    }
}

// MARK: - Calendar Density

/// How packed the calendar is
public enum CalendarDensity: String, Codable {
    case light
    case moderate
    case busy
    case packed
    
    public var displayName: String {
        switch self {
        case .light: return "Light schedule"
        case .moderate: return "Moderate schedule"
        case .busy: return "Busy week"
        case .packed: return "Very packed"
        }
    }
    
    /// Initialize from event count
    public static func from(eventCount: Int, over days: Int = 7) -> CalendarDensity {
        let perDay = Double(eventCount) / Double(days)
        switch perDay {
        case 0..<2: return .light
        case 2..<4: return .moderate
        case 4..<6: return .busy
        default: return .packed
        }
    }
}

// MARK: - Conversation Opportunity

/// An opportunity for proactive conversation based on calendar
public struct ConversationOpportunity: Equatable, Identifiable {
    public let id: String
    public let topic: String
    public let reason: String
    public let suggestedOpener: String
    public let relatedEvent: CalendarEvent?
    public let bestTime: Date
    public let urgency: Urgency
    
    public init(
        id: String = UUID().uuidString,
        topic: String,
        reason: String,
        suggestedOpener: String,
        relatedEvent: CalendarEvent? = nil,
        bestTime: Date = Date(),
        urgency: Urgency = .low
    ) {
        self.id = id
        self.topic = topic
        self.reason = reason
        self.suggestedOpener = suggestedOpener
        self.relatedEvent = relatedEvent
        self.bestTime = bestTime
        self.urgency = urgency
    }
}

// MARK: - Urgency

/// Urgency level for conversation opportunities
public enum Urgency: String, Codable {
    case low
    case medium
    case high
}

// MARK: - Event Semantics

/// Rich semantic understanding of an event
public struct EventSemantics: Equatable {
    public let event: CalendarEvent
    public let stressLevel: StressLevel
    public let preparationNeeded: PreparationLevel
    public let emotionalValence: EmotionalValence
    public let relatedPeople: [String]
    public let suggestedTopics: [String]
    
    public init(
        event: CalendarEvent,
        stressLevel: StressLevel = .mild,
        preparationNeeded: PreparationLevel = .none,
        emotionalValence: EmotionalValence = .neutral,
        relatedPeople: [String] = [],
        suggestedTopics: [String] = []
    ) {
        self.event = event
        self.stressLevel = stressLevel
        self.preparationNeeded = preparationNeeded
        self.emotionalValence = emotionalValence
        self.relatedPeople = relatedPeople
        self.suggestedTopics = suggestedTopics
    }
}

/// Level of preparation needed for an event
public enum PreparationLevel: String, Codable {
    case none
    case light
    case moderate
    case heavy
}

/// Emotional valence of an event
public enum EmotionalValence: String, Codable {
    case positive
    case neutral
    case anxious
    case negative
}
