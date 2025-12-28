//
//  Persona.swift
//  Ferni
//
//  Represents a Ferni team member persona.
//  Each persona has distinct personality, expertise, and visual identity.
//

import Foundation

// MARK: - Persona

/// A Ferni team member persona
public struct Persona: Identifiable, Codable, Equatable, Hashable {
    public let id: PersonaId
    public let name: String
    public let role: String
    public let description: String
    public let voiceId: String
    public let avatarName: String
    
    public init(
        id: PersonaId,
        name: String,
        role: String,
        description: String,
        voiceId: String,
        avatarName: String
    ) {
        self.id = id
        self.name = name
        self.role = role
        self.description = description
        self.voiceId = voiceId
        self.avatarName = avatarName
    }
}

// MARK: - Persona ID

/// Unique identifier for each persona
public enum PersonaId: String, Codable, CaseIterable, Hashable {
    case ferni = "ferni"
    case peter = "peter"
    case maya = "maya"
    case jordan = "jordan"
    case alex = "alex"
    case nayan = "nayan"
    
    /// Display name for the persona
    public var displayName: String {
        switch self {
        case .ferni: return "Ferni"
        case .peter: return "Peter"
        case .maya: return "Maya"
        case .jordan: return "Jordan"
        case .alex: return "Alex"
        case .nayan: return "Nayan"
        }
    }
    
    /// Persona's area of expertise
    public var expertise: String {
        switch self {
        case .ferni: return "Life Coach & Coordinator"
        case .peter: return "Research & Analysis"
        case .maya: return "Habits & Routines"
        case .jordan: return "Events & Milestones"
        case .alex: return "Communication & Relationships"
        case .nayan: return "Wisdom & Philosophy"
        }
    }
}

// MARK: - Default Personas

extension Persona {
    /// The main Ferni persona - warm, grounded, wise, present
    public static let ferni = Persona(
        id: .ferni,
        name: "Ferni",
        role: "Life Coach",
        description: "Your warm, grounded companion who helps you navigate life with wisdom and presence.",
        voiceId: "ferni-voice",
        avatarName: "avatar-ferni"
    )
    
    /// Peter - Research & Analysis expert
    public static let peter = Persona(
        id: .peter,
        name: "Peter",
        role: "Research Analyst",
        description: "Sharp analytical mind who helps you make informed decisions with data and research.",
        voiceId: "peter-voice",
        avatarName: "avatar-peter"
    )
    
    /// Maya - Habits & Routines coach
    public static let maya = Persona(
        id: .maya,
        name: "Maya",
        role: "Habits Coach",
        description: "Patient habit builder who helps you create lasting positive routines.",
        voiceId: "maya-voice",
        avatarName: "avatar-maya"
    )
    
    /// Jordan - Events & Milestones planner
    public static let jordan = Persona(
        id: .jordan,
        name: "Jordan",
        role: "Event Planner",
        description: "Creative celebrator who helps you mark life's moments and plan meaningful events.",
        voiceId: "jordan-voice",
        avatarName: "avatar-jordan"
    )
    
    /// Alex - Communication & Relationships guide
    public static let alex = Persona(
        id: .alex,
        name: "Alex",
        role: "Communication Guide",
        description: "Empathetic communicator who helps you navigate relationships and express yourself.",
        voiceId: "alex-voice",
        avatarName: "avatar-alex"
    )
    
    /// Nayan - Wisdom & Philosophy mentor
    public static let nayan = Persona(
        id: .nayan,
        name: "Nayan",
        role: "Wisdom Mentor",
        description: "Thoughtful philosopher who helps you find meaning and perspective in life.",
        voiceId: "nayan-voice",
        avatarName: "avatar-nayan"
    )
    
    /// All available personas
    public static let all: [Persona] = [.ferni, .peter, .maya, .jordan, .alex, .nayan]
    
    /// Get persona by ID
    public static func byId(_ id: PersonaId) -> Persona {
        switch id {
        case .ferni: return .ferni
        case .peter: return .peter
        case .maya: return .maya
        case .jordan: return .jordan
        case .alex: return .alex
        case .nayan: return .nayan
        }
    }
}
