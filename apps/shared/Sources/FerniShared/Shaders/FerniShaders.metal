// MARK: - Ferni Metal Shaders
// GPU-accelerated visual effects for "Better Than Human" emotional presence.
//
// Shader Types:
// - breathingGlow: Pulsing radial glow synchronized with breath
// - emotionalAura: Color-shifting aura based on mood
// - memorySparkle: Particle shimmer for memory recognition moments
// - warmthWave: Gentle warming effect for connection

#include <metal_stdlib>
using namespace metal;

// MARK: - Breathing Glow Shader

/// Creates a smooth, pulsing radial glow effect
/// Use for avatar breathing animation - syncs with breath phase
///
/// Parameters:
/// - time: Animation time (seconds)
/// - breathPhase: Current breath phase (0-1, 0.5 = peak inhale)
/// - glowColor: Base glow color (RGB)
/// - intensity: Glow intensity multiplier (0-1)
[[stitchable]] half4 breathingGlow(
    float2 position,
    half4 color,
    float time,
    float breathPhase,
    half4 glowColor,
    float intensity
) {
    // Calculate distance from center (normalized)
    float2 center = float2(0.5, 0.5);
    float dist = distance(position, center);

    // Breath-synchronized pulse
    float breathPulse = sin(breathPhase * M_PI_F) * 0.3 + 0.7;  // 0.7 - 1.0

    // Radial falloff with soft edge
    float glow = smoothstep(0.5, 0.0, dist * breathPulse);

    // Add subtle animation variation
    float variation = sin(time * 0.5 + dist * 6.0) * 0.1 + 0.9;

    // Combine glow with base color
    half4 result = color;
    result.rgb += glowColor.rgb * half(glow * intensity * variation);
    result.a = max(result.a, half(glow * intensity * 0.5));

    return result;
}

// MARK: - Emotional Aura Shader

/// Creates a color-shifting aura effect based on emotional state
/// Colors smoothly transition as mood changes
///
/// Parameters:
/// - time: Animation time
/// - moodValue: Current mood (0=low, 0.5=neutral, 1=great)
/// - primaryColor: Persona's primary color
/// - warmth: Late night warmth adjustment (0-1)
[[stitchable]] half4 emotionalAura(
    float2 position,
    half4 color,
    float time,
    float moodValue,
    half4 primaryColor,
    float warmth
) {
    float2 center = float2(0.5, 0.5);
    float dist = distance(position, center);

    // Mood affects the spread and intensity
    float spread = mix(0.3, 0.6, moodValue);
    float auraIntensity = mix(0.2, 0.5, moodValue);

    // Aura calculation with soft falloff
    float aura = smoothstep(spread, 0.0, dist);

    // Color temperature shift based on warmth
    half3 warmColor = half3(1.0, 0.85, 0.6);
    half3 auraColor = mix(primaryColor.rgb, warmColor, warmth * 0.3);

    // Gentle animation
    float pulse = sin(time * 1.5) * 0.1 + 0.9;

    // Apply aura
    half4 result = color;
    result.rgb = mix(result.rgb, auraColor, aura * auraIntensity * pulse);

    return result;
}

// MARK: - Memory Sparkle Shader

/// Creates a particle-like shimmer effect for memory recognition
/// Triggers when Ferni recognizes something from shared history
///
/// Parameters:
/// - time: Animation time
/// - sparkleIntensity: Overall sparkle intensity (0-1)
/// - sparkleColor: Color of sparkles (typically gold/white)
[[stitchable]] half4 memorySparkle(
    float2 position,
    half4 color,
    float time,
    float sparkleIntensity,
    half4 sparkleColor
) {
    // Generate pseudo-random sparkle positions
    float2 grid = floor(position * 20.0);
    float random = fract(sin(dot(grid, float2(12.9898, 78.233))) * 43758.5453);

    // Sparkle animation - each cell twinkles at different phase
    float sparklePhase = random * 6.28;
    float sparkle = pow(max(0.0, sin(time * 3.0 + sparklePhase)), 8.0);

    // Only show sparkle if random value is high (sparse sparkles)
    float threshold = 0.92;
    sparkle *= step(threshold, random);

    // Distance from cell center for soft sparkle shape
    float2 cellPos = fract(position * 20.0);
    float cellDist = distance(cellPos, float2(0.5, 0.5));
    sparkle *= smoothstep(0.3, 0.0, cellDist);

    // Apply sparkle
    half4 result = color;
    result.rgb += sparkleColor.rgb * half(sparkle * sparkleIntensity);
    result.a = max(result.a, half(sparkle * sparkleIntensity));

    return result;
}

// MARK: - Warmth Wave Shader

/// Creates a gentle warming wave effect for connection moments
/// Radiates outward from center on emotional peaks
///
/// Parameters:
/// - time: Animation time
/// - waveProgress: Wave expansion progress (0-1)
/// - warmthColor: Warm amber color
[[stitchable]] half4 warmthWave(
    float2 position,
    half4 color,
    float time,
    float waveProgress,
    half4 warmthColor
) {
    float2 center = float2(0.5, 0.5);
    float dist = distance(position, center);

    // Expanding wave ring
    float waveRadius = waveProgress * 0.8;
    float waveWidth = 0.15;

    float wave = smoothstep(waveRadius - waveWidth, waveRadius, dist) *
                 smoothstep(waveRadius + waveWidth, waveRadius, dist);

    // Fade as wave expands
    float fade = 1.0 - waveProgress;

    // Apply warmth
    half4 result = color;
    result.rgb += warmthColor.rgb * wave * fade * 0.5;

    return result;
}

// MARK: - Concern Pulse Shader

/// Creates a gentle pulsing effect for concern detection
/// Soft, caring visual that doesn't alarm
///
/// Parameters:
/// - time: Animation time
/// - concernLevel: Level of detected concern (0-1)
/// - careColor: Soft caring color (typically soft pink/lavender)
[[stitchable]] half4 concernPulse(
    float2 position,
    half4 color,
    float time,
    float concernLevel,
    half4 careColor
) {
    float2 center = float2(0.5, 0.5);
    float dist = distance(position, center);

    // Gentle pulse that increases with concern
    float pulseSpeed = mix(1.0, 2.0, concernLevel);
    float pulse = sin(time * pulseSpeed) * 0.5 + 0.5;

    // Soft glow that grows with concern
    float glowSize = mix(0.2, 0.4, concernLevel);
    float glow = smoothstep(glowSize, 0.0, dist);

    // Apply caring overlay
    half4 result = color;
    result.rgb = mix(result.rgb, careColor.rgb, glow * pulse * concernLevel * 0.3);

    return result;
}

// MARK: - Glass Blur Effect

/// Creates a frosted glass blur effect
/// Used for modal backgrounds and overlays
///
/// Note: This is a simple approximation. True blur requires multiple passes.
[[stitchable]] half4 glassEffect(
    float2 position,
    half4 color,
    float blurAmount,
    float saturation
) {
    // Reduce saturation for glass effect
    half3 gray = half3(dot(color.rgb, half3(0.299, 0.587, 0.114)));
    half3 desaturated = mix(gray, color.rgb, saturation);

    // Slight tint
    half3 tint = half3(1.0, 1.0, 1.02);  // Very slight cool tint

    half4 result;
    result.rgb = desaturated * tint;
    result.a = color.a;

    return result;
}
