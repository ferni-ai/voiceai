import SwiftUI

// MARK: - Waveform Visualizer

/// Audio waveform visualization with animated bars
/// Matches frontend-typescript/src/ui/waveform-ring.ui.ts
struct WaveformView: View {
    let persona: Persona
    let isActive: Bool
    let barCount: Int
    
    @State private var barHeights: [CGFloat]
    
    init(persona: Persona, isActive: Bool, barCount: Int = 8) {
        self.persona = persona
        self.isActive = isActive
        self.barCount = barCount
        self._barHeights = State(initialValue: Array(repeating: 0.3, count: barCount))
    }
    
    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<barCount, id: \.self) { index in
                WaveformBar(
                    height: barHeights[index],
                    color: persona.primaryColor,
                    index: index,
                    isActive: isActive
                )
            }
        }
        .frame(height: 24)
        .onAppear {
            if isActive {
                startAnimation()
            }
        }
        .onChange(of: isActive) { active in
            if active {
                startAnimation()
            }
        }
    }
    
    private func startAnimation() {
        // Staggered animation for each bar
        for i in 0..<barCount {
            let delay = Double(i) * 0.08
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                animateBar(at: i)
            }
        }
    }
    
    private func animateBar(at index: Int) {
        guard isActive else { return }
        
        let duration = Double.random(in: 0.3...0.5)
        let targetHeight = CGFloat.random(in: 0.3...1.0)
        
        withAnimation(.easeInOut(duration: duration)) {
            barHeights[index] = targetHeight
        }
        
        // Continue animation loop
        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
            animateBar(at: index)
        }
    }
    
    /// Update bar heights based on audio levels
    func updateLevels(_ levels: [Float]) {
        for (i, level) in levels.prefix(barCount).enumerated() {
            withAnimation(.easeOut(duration: 0.1)) {
                barHeights[i] = CGFloat(max(0.2, min(1.0, level)))
            }
        }
    }
}

// MARK: - Individual Waveform Bar

struct WaveformBar: View {
    let height: CGFloat
    let color: Color
    let index: Int
    let isActive: Bool
    
    @State private var animatedHeight: CGFloat = 0.3
    
    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(color.opacity(isActive ? 1.0 : 0.4))
            .frame(width: 4, height: animatedHeight * 24)
            .onAppear {
                startAnimation()
            }
            .onChange(of: isActive) { active in
                if active {
                    startAnimation()
                }
            }
    }
    
    private func startAnimation() {
        guard isActive else {
            withAnimation(.easeOut(duration: 0.3)) {
                animatedHeight = 0.3
            }
            return
        }
        
        let delay = Double(index) * 0.08
        let duration = Double.random(in: 0.4...0.6)
        
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            withAnimation(
                .easeInOut(duration: duration)
                .repeatForever(autoreverses: true)
            ) {
                animatedHeight = CGFloat.random(in: 0.4...1.0)
            }
        }
    }
}

// MARK: - Circular Waveform Ring

/// Ring-style waveform around the avatar
/// Matches frontend-typescript/src/ui/waveform-ring.ui.ts
struct WaveformRing: View {
    let persona: Persona
    let size: CGFloat
    let isActive: Bool
    let segmentCount: Int
    
    @State private var segmentLevels: [CGFloat]
    
    init(persona: Persona, size: CGFloat, isActive: Bool, segmentCount: Int = 32) {
        self.persona = persona
        self.size = size
        self.isActive = isActive
        self.segmentCount = segmentCount
        self._segmentLevels = State(initialValue: Array(repeating: 0.3, count: segmentCount))
    }
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                ForEach(0..<segmentCount, id: \.self) { index in
                    WaveformSegment(
                        level: segmentLevels[index],
                        color: persona.primaryColor,
                        angle: Double(index) / Double(segmentCount) * 360,
                        radius: size / 2 * 1.15
                    )
                }
            }
            .frame(width: size, height: size)
            .position(x: geometry.size.width / 2, y: geometry.size.height / 2)
        }
        .frame(width: size * 1.4, height: size * 1.4)
        .onAppear {
            if isActive {
                startAnimation()
            }
        }
        .onChange(of: isActive) { active in
            if active {
                startAnimation()
            } else {
                // Reset levels when inactive
                withAnimation(.easeOut(duration: 0.3)) {
                    segmentLevels = Array(repeating: 0.3, count: segmentCount)
                }
            }
        }
    }
    
    private func startAnimation() {
        // Animate segments with wave pattern
        for i in 0..<segmentCount {
            animateSegment(at: i)
        }
    }
    
    private func animateSegment(at index: Int) {
        guard isActive else { return }
        
        let baseDelay = Double(index) * 0.03
        let duration = Double.random(in: 0.3...0.6)
        
        DispatchQueue.main.asyncAfter(deadline: .now() + baseDelay) {
            withAnimation(.easeInOut(duration: duration)) {
                segmentLevels[index] = CGFloat.random(in: 0.2...1.0)
            }
            
            // Continue animation
            DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
                animateSegment(at: index)
            }
        }
    }
}

// MARK: - Waveform Segment

struct WaveformSegment: View {
    let level: CGFloat
    let color: Color
    let angle: Double
    let radius: CGFloat
    
    var body: some View {
        Rectangle()
            .fill(color.opacity(0.7 + level * 0.3))
            .frame(width: 2, height: 4 + level * 8)
            .offset(y: -radius)
            .rotationEffect(.degrees(angle))
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 40) {
        WaveformView(persona: PersonaRegistry.ferni, isActive: true)
        
        ZStack {
            WaveformRing(persona: PersonaRegistry.maya, size: 100, isActive: true)
            Circle()
                .fill(Color(hex: 0xa67a6a))
                .frame(width: 100, height: 100)
        }
    }
    .padding(40)
    .background(Color(hex: 0x584840))
}

