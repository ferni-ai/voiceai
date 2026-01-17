import SwiftUI

// MARK: - Persona Model

/// Represents a Ferni team member persona with their unique styling
public struct Persona: Identifiable, Equatable {
    public let id: String
    public let name: String
    public let emoji: String
    public let initials: String
    public let role: String
    public let specialty: String

    // Colors from design-system/tokens/colors.json
    public let primaryColor: Color
    public let secondaryColor: Color
    public let glowColor: Color

    public init(
        id: String,
        name: String,
        emoji: String,
        initials: String,
        role: String,
        specialty: String,
        primaryColor: Color,
        secondaryColor: Color,
        glowColor: Color
    ) {
        self.id = id
        self.name = name
        self.emoji = emoji
        self.initials = initials
        self.role = role
        self.specialty = specialty
        self.primaryColor = primaryColor
        self.secondaryColor = secondaryColor
        self.glowColor = glowColor
    }

    /// The primary hex value for gradient generation
    public var primaryHex: String {
        switch id {
        case "ferni": return "#4a6741"
        case "maya": return "#a67a6a"
        case "alex": return "#5a6b8a"
        case "jordan": return "#c4856a"
        case "peter": return "#3a6b73"
        case "nayan": return "#9a7b5a"
        default: return "#4a6741"
        }
    }

    /// Short tagline for display (alias for role)
    public var tagline: String {
        role
    }
}

// MARK: - Persona Registry

/// All available Ferni team personas
/// Colors sourced from design-system/tokens/colors.json
public enum PersonaRegistry {

    /// Ferni - CEO & Life Coach (Sage Green)
    public static let ferni = Persona(
        id: "ferni",
        name: "Ferni",
        emoji: "🌿",
        initials: "FE",
        role: "Life Coach",
        specialty: "Leadership, life direction, bringing in the right expert",
        primaryColor: Color(hex: 0x4a6741),
        secondaryColor: Color(hex: 0x3d5a35),
        glowColor: Color(hex: 0x4a6741).opacity(0.4)
    )

    /// Maya Santos - Habits Coach (Rose/Terracotta)
    public static let maya = Persona(
        id: "maya",
        name: "Maya",
        emoji: "🦋",
        initials: "MS",
        role: "Habits Coach",
        specialty: "Building habits, breaking bad ones, behavior change",
        primaryColor: Color(hex: 0xa67a6a),
        secondaryColor: Color(hex: 0x8a635a),
        glowColor: Color(hex: 0xa67a6a).opacity(0.4)
    )

    /// Alex Chen - Communications Coach (Slate Blue)
    public static let alex = Persona(
        id: "alex",
        name: "Alex",
        emoji: "💬",
        initials: "AC",
        role: "Communications",
        specialty: "Difficult conversations, relationships, conflict resolution",
        primaryColor: Color(hex: 0x5a6b8a),
        secondaryColor: Color(hex: 0x4a5a73),
        glowColor: Color(hex: 0x5a6b8a).opacity(0.4)
    )

    /// Jordan Taylor - Life Planner (Coral)
    public static let jordan = Persona(
        id: "jordan",
        name: "Jordan",
        emoji: "📋",
        initials: "JT",
        role: "Life Planner",
        specialty: "Goals, planning, productivity, time management",
        primaryColor: Color(hex: 0xc4856a),
        secondaryColor: Color(hex: 0xa86d55),
        glowColor: Color(hex: 0xc4856a).opacity(0.4)
    )

    /// Peter John - Research Analyst (Ocean Teal)
    public static let peter = Persona(
        id: "peter",
        name: "Peter",
        emoji: "🔬",
        initials: "PJ",
        role: "Research",
        specialty: "Deep research, analysis, finding answers",
        primaryColor: Color(hex: 0x3a6b73),
        secondaryColor: Color(hex: 0x2d5359),
        glowColor: Color(hex: 0x3a6b73).opacity(0.4)
    )

    /// Nayan Patel - Wisdom Sage (Warm Brown/Gold)
    public static let nayan = Persona(
        id: "nayan",
        name: "Nayan",
        emoji: "🧘",
        initials: "NP",
        role: "Wisdom",
        specialty: "Philosophy, mindfulness, deeper meaning",
        primaryColor: Color(hex: 0x9a7b5a),
        secondaryColor: Color(hex: 0x7a5b3a),
        glowColor: Color(hex: 0xb8956a).opacity(0.4)
    )

    /// All personas in display order
    public static let all: [Persona] = [ferni, maya, alex, jordan, peter, nayan]

    /// Get persona by ID
    public static func get(_ id: String) -> Persona {
        all.first { $0.id == id } ?? ferni
    }
}
