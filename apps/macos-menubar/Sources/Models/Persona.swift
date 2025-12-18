import SwiftUI

// MARK: - Persona Model

/// Represents a Ferni team member persona with their unique styling
struct Persona: Identifiable, Equatable {
    let id: String
    let name: String
    let emoji: String
    let initials: String
    let role: String
    let specialty: String
    
    // Colors from design-system/tokens/colors.json
    let primaryColor: Color
    let secondaryColor: Color
    let glowColor: Color
    
    /// The primary hex value for gradient generation
    var primaryHex: String {
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
    var tagline: String {
        role
    }
}

// MARK: - Persona Registry

/// All available Ferni team personas
/// Colors sourced from design-system/tokens/colors.json
enum PersonaRegistry {
    
    /// Ferni - CEO & Life Coach (Sage Green)
    static let ferni = Persona(
        id: "ferni",
        name: "Ferni",
        emoji: "🌿",
        initials: "FN",
        role: "Life Coach",
        specialty: "Leadership, life direction, bringing in the right expert",
        primaryColor: Color(hex: 0x4a6741),
        secondaryColor: Color(hex: 0x3d5a35),
        glowColor: Color(hex: 0x4a6741).opacity(0.4)
    )
    
    /// Maya Santos - Habits Coach (Rose/Terracotta)
    static let maya = Persona(
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
    static let alex = Persona(
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
    static let jordan = Persona(
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
    static let peter = Persona(
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
    static let nayan = Persona(
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
    static let all: [Persona] = [ferni, maya, alex, jordan, peter, nayan]
    
    /// Get persona by ID
    static func get(_ id: String) -> Persona {
        all.first { $0.id == id } ?? ferni
    }
}

// MARK: - Color Extension

extension Color {
    /// Create color from hex value
    init(hex: UInt, alpha: Double = 1.0) {
        let red = Double((hex >> 16) & 0xFF) / 255.0
        let green = Double((hex >> 8) & 0xFF) / 255.0
        let blue = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
    }
    
    /// Create color from hex string
    init(hexString: String) {
        let hex = hexString.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        self.init(hex: UInt(int))
    }
}

