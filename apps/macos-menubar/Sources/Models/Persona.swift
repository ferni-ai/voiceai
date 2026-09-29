import SwiftUI
import FerniShared

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

    /// WCAG AA compliant text color for dark backgrounds (4.5:1+ contrast)
    /// Use this when displaying persona-colored text on dark theme backgrounds
    let textColorOnDark: Color

    /// The primary hex value for gradient generation
    var primaryHex: String {
        FerniTokens.Persona.primaryHexString(for: id)
    }

    /// Short tagline for display (alias for role)
    var tagline: String {
        role
    }
}

// MARK: - Persona Registry

/// All available Ferni team personas
/// Colors come from FerniTokens (generated from design-system/tokens/colors.json)
enum PersonaRegistry {
    
    /// Ferni - CEO & Life Coach (Sage Green)
    static let ferni = Persona(
        id: "ferni",
        name: "Ferni",
        emoji: "🌿",
        initials: "FE",
        role: "Life Coach",
        specialty: "Leadership, life direction, bringing in the right expert",
        primaryColor: Color(hex: FerniTokens.Persona.ferniPrimary),
        secondaryColor: Color(hex: FerniTokens.Persona.ferniSecondary),
        glowColor: Color(hex: FerniTokens.Persona.ferniPrimary).opacity(0.4),
        textColorOnDark: Color(hex: FerniTokens.Persona.ferniTextOnDark)
    )

    /// Maya Santos - Habits Coach (Rose/Terracotta)
    static let maya = Persona(
        id: "maya",
        name: "Maya",
        emoji: "🦋",
        initials: "MS",
        role: "Habits Coach",
        specialty: "Building habits, breaking bad ones, behavior change",
        primaryColor: Color(hex: FerniTokens.Persona.mayaPrimary),
        secondaryColor: Color(hex: FerniTokens.Persona.mayaSecondary),
        glowColor: Color(hex: FerniTokens.Persona.mayaPrimary).opacity(0.4),
        textColorOnDark: Color(hex: FerniTokens.Persona.mayaTextOnDark)
    )

    /// Alex Chen - Communications Coach (Slate Blue)
    static let alex = Persona(
        id: "alex",
        name: "Alex",
        emoji: "💬",
        initials: "AC",
        role: "Communications",
        specialty: "Difficult conversations, relationships, conflict resolution",
        primaryColor: Color(hex: FerniTokens.Persona.alexPrimary),
        secondaryColor: Color(hex: FerniTokens.Persona.alexSecondary),
        glowColor: Color(hex: FerniTokens.Persona.alexPrimary).opacity(0.4),
        textColorOnDark: Color(hex: FerniTokens.Persona.alexTextOnDark)
    )

    /// Jordan Taylor - Life Planner (Coral)
    static let jordan = Persona(
        id: "jordan",
        name: "Jordan",
        emoji: "📋",
        initials: "JT",
        role: "Life Planner",
        specialty: "Goals, planning, productivity, time management",
        primaryColor: Color(hex: FerniTokens.Persona.jordanPrimary),
        secondaryColor: Color(hex: FerniTokens.Persona.jordanSecondary),
        glowColor: Color(hex: FerniTokens.Persona.jordanPrimary).opacity(0.4),
        textColorOnDark: Color(hex: FerniTokens.Persona.jordanTextOnDark)
    )

    /// Peter John - Research Analyst (Ocean Teal)
    static let peter = Persona(
        id: "peter",
        name: "Peter",
        emoji: "🔬",
        initials: "PJ",
        role: "Research",
        specialty: "Deep research, analysis, finding answers",
        primaryColor: Color(hex: FerniTokens.Persona.peterPrimary),
        secondaryColor: Color(hex: FerniTokens.Persona.peterSecondary),
        glowColor: Color(hex: FerniTokens.Persona.peterPrimary).opacity(0.4),
        textColorOnDark: Color(hex: FerniTokens.Persona.peterTextOnDark)
    )

    /// Nayan Patel - Wisdom Sage (Warm Brown/Gold)
    static let nayan = Persona(
        id: "nayan",
        name: "Nayan",
        emoji: "🧘",
        initials: "NP",
        role: "Wisdom",
        specialty: "Philosophy, mindfulness, deeper meaning",
        primaryColor: Color(hex: FerniTokens.Persona.nayanPrimary),
        secondaryColor: Color(hex: FerniTokens.Persona.nayanSecondary),
        glowColor: Color(hex: FerniTokens.Persona.nayanPrimary).opacity(0.4),
        textColorOnDark: Color(hex: FerniTokens.Persona.nayanTextOnDark)
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

