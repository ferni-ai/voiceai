import SwiftUI

/// Three-Layer Speaking Animation System for Ferni
///
/// "Three layers working in harmony to convey speech without a mouth"
///
/// Layers:
/// 1. Body Pulse (PRIMARY) - Avatar squash/stretch with voice volume
/// 2. Halo Pulse (AMBIENT) - Presence ring scales + secondary waves
/// 3. Lid Mouth (DETAIL) - Bottom lid opens with volume
///
/// Reference: design-system/brand/SPEAKING-SYSTEM.md
struct FerniSpeakingAvatar: View {
    
    // MARK: - Configuration
    
    struct Config {
        struct Body {
            let maxScaleY: CGFloat = 1.08
            let minScaleX: CGFloat = 0.97
            let squashRatio: CGFloat = 0.4
            let eyeSquintMax: CGFloat = 0.15
        }
        
        struct Halo {
            let maxScale: CGFloat = 1.015
            let minOpacity: Double = 0.3
            let maxOpacity: Double = 0.5
            let waveCount: Int = 2
            let waveScaleIncrement: CGFloat = 0.04
            let waveOpacityDecay: Double = 0.5
        }
        
        struct Lid {
            let bottomYClosed: CGFloat = 110
            let bottomYOpen: CGFloat = 70
            let topYClosed: CGFloat = -10
            let topYOpen: CGFloat = 15
        }
        
        let body = Body()
        let halo = Halo()
        let lid = Lid()
    }
    
    private let config = Config()
    
    // MARK: - Properties
    
    let size: CGFloat
    
    /// Voice volume (0.0 - 1.0)
    @Binding var volume: CGFloat
    
    /// Persona primary color
    var primaryColor: Color = Color(red: 74/255, green: 103/255, blue: 65/255) // Ferni green
    
    /// Secondary gradient color
    var secondaryColor: Color = Color(red: 61/255, green: 90/255, blue: 53/255)
    
    // MARK: - Computed Animation Values
    
    private var bodyScaleY: CGFloat {
        1 + (volume * (config.body.maxScaleY - 1))
    }
    
    private var bodyScaleX: CGFloat {
        let stretchAmount = volume * (config.body.maxScaleY - 1)
        return 1 - (stretchAmount * config.body.squashRatio)
    }
    
    private var haloScale: CGFloat {
        1 + (volume * (config.halo.maxScale - 1))
    }
    
    private var haloOpacity: Double {
        config.halo.minOpacity + (Double(volume) * (config.halo.maxOpacity - config.halo.minOpacity))
    }
    
    private var lidBottomY: CGFloat {
        config.lid.bottomYClosed - (volume * (config.lid.bottomYClosed - config.lid.bottomYOpen))
    }
    
    private var lidTopY: CGFloat {
        config.lid.topYClosed + (volume * (config.lid.topYOpen - config.lid.topYClosed))
    }
    
    private var eyeSquint: CGFloat {
        1 - (volume * config.body.eyeSquintMax)
    }
    
    // MARK: - Body
    
    var body: some View {
        ZStack {
            // Layer 1: Halo with waves
            haloLayer
            
            // Layer 2: Body with squash/stretch
            bodyLayer
        }
        .frame(width: size, height: size)
        .animation(.interactiveSpring(response: 0.08, dampingFraction: 0.7), value: volume)
    }
    
    // MARK: - Layer 1: Halo Pulse
    
    private var haloLayer: some View {
        ZStack {
            // Secondary waves (sound emanating)
            ForEach(0..<config.halo.waveCount, id: \.self) { index in
                Circle()
                    .stroke(primaryColor, lineWidth: 1)
                    .scaleEffect(haloScale + (CGFloat(index + 1) * config.halo.waveScaleIncrement * volume))
                    .opacity(haloOpacity * pow(config.halo.waveOpacityDecay, Double(index + 1)) * Double(volume))
            }
            
            // Primary ring
            Circle()
                .stroke(primaryColor, lineWidth: 1.5)
                .scaleEffect(haloScale)
                .opacity(haloOpacity)
        }
        .frame(width: size * 1.15, height: size * 1.15)
    }
    
    // MARK: - Layer 2: Body Pulse
    
    private var bodyLayer: some View {
        ZStack {
            // Green orb
            Circle()
                .fill(
                    LinearGradient(
                        colors: [secondaryColor, primaryColor],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: size, height: size)
            
            // Eyes
            eyesLayer
            
            // Layer 3: Lid Mouth overlay
            lidOverlay
        }
        .scaleEffect(x: bodyScaleX, y: bodyScaleY)
    }
    
    // MARK: - Eyes
    
    private var eyesLayer: some View {
        HStack(spacing: size * 0.14) {
            // Left eye
            Ellipse()
                .fill(
                    LinearGradient(
                        colors: [.white, Color(white: 0.94)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: size * 0.14, height: size * 0.2 * eyeSquint)
            
            // Right eye
            Ellipse()
                .fill(
                    LinearGradient(
                        colors: [.white, Color(white: 0.94)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: size * 0.14, height: size * 0.2 * eyeSquint)
        }
        .offset(y: -size * 0.04)
    }
    
    // MARK: - Layer 3: Lid Mouth
    
    private var lidOverlay: some View {
        GeometryReader { geometry in
            let w = geometry.size.width
            let h = geometry.size.height
            
            ZStack {
                // Top lid (slight close when speaking)
                LidShape(
                    controlY: lidTopY / 100 * h,
                    isTop: true
                )
                .fill(Color(red: 245/255, green: 241/255, blue: 232/255)) // Cream background
                .frame(width: w, height: h)
                
                // Bottom lid (opens with volume)
                LidShape(
                    controlY: lidBottomY / 100 * h,
                    isTop: false
                )
                .fill(Color(red: 245/255, green: 241/255, blue: 232/255))
                .frame(width: w, height: h)
            }
        }
        .clipShape(Circle())
    }
}

// MARK: - Lid Shape

struct LidShape: Shape {
    var controlY: CGFloat
    let isTop: Bool
    
    var animatableData: CGFloat {
        get { controlY }
        set { controlY = newValue }
    }
    
    func path(in rect: CGRect) -> Path {
        var path = Path()
        
        if isTop {
            // Top lid: M 0,0 Q 50,controlY 100,0
            path.move(to: CGPoint(x: 0, y: 0))
            path.addQuadCurve(
                to: CGPoint(x: rect.width, y: 0),
                control: CGPoint(x: rect.width / 2, y: controlY)
            )
            path.addLine(to: CGPoint(x: rect.width, y: 0))
            path.addLine(to: CGPoint(x: 0, y: 0))
            path.closeSubpath()
        } else {
            // Bottom lid: M 0,100 Q 50,controlY 100,100
            path.move(to: CGPoint(x: 0, y: rect.height))
            path.addQuadCurve(
                to: CGPoint(x: rect.width, y: rect.height),
                control: CGPoint(x: rect.width / 2, y: controlY)
            )
            path.addLine(to: CGPoint(x: rect.width, y: rect.height))
            path.addLine(to: CGPoint(x: 0, y: rect.height))
            path.closeSubpath()
        }
        
        return path
    }
}

// MARK: - Preview

struct FerniSpeakingAvatar_Previews: PreviewProvider {
    struct PreviewWrapper: View {
        @State private var volume: CGFloat = 0.5
        
        var body: some View {
            VStack(spacing: 40) {
                FerniSpeakingAvatar(size: 140, volume: $volume)
                
                VStack {
                    Text("Volume: \(Int(volume * 100))%")
                        .font(.caption)
                    
                    Slider(value: $volume, in: 0...1)
                        .padding(.horizontal)
                }
            }
            .padding()
            .background(Color(red: 245/255, green: 241/255, blue: 232/255))
        }
    }
    
    static var previews: some View {
        PreviewWrapper()
    }
}
