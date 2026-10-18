import SwiftUI

/// Team member persona colors for window avatar
public enum WindowPersona: String, CaseIterable, Sendable {
    case ferni
    case peter
    case maya
    case jordan
    case nayan
    case alex
    
    /// The avatar for a PersonaRegistry id ("maya"); Ferni for an unknown id.
    public init(personaId: String) {
        self = WindowPersona(rawValue: personaId.lowercased()) ?? .ferni
    }

    public var primaryColor: Color {
        switch self {
        case .ferni: return Color(hexString: "#4a6741")
        case .peter: return Color(hexString: "#3a6b73")
        case .maya: return Color(hexString: "#a67a6a")
        case .jordan: return Color(hexString: "#c4856a")
        case .nayan: return Color(hexString: "#b8956a")
        case .alex: return Color(hexString: "#5a6b8a")
        }
    }
    
    var secondaryColor: Color {
        switch self {
        case .ferni: return Color(hexString: "#3d5a35")
        case .peter: return Color(hexString: "#2d5359")
        case .maya: return Color(hexString: "#8a635a")
        case .jordan: return Color(hexString: "#a86d55")
        case .nayan: return Color(hexString: "#9a7a52")
        case .alex: return Color(hexString: "#4a5a73")
        }
    }
}
