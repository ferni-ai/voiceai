import React, { useRef, useMemo, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sphere, Float, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { vanguardTheme } from '../theme/vanguard';
import { GPUParticles } from './GPUParticles';

interface OrbProps {
  isListening: boolean;
  isSpeaking: boolean;
  audioLevel?: number;
  onClick?: () => void;
  particleCount?: number;
}

// Legacy CPU-based particle system (fallback)
const ParticleField: React.FC<{ intensity: number }> = ({ intensity }) => {
  const points = useRef<THREE.Points>(null);
  const particleCount = 1500;

  const positions = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const radius = 4;

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.cbrt(Math.random()) * radius;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }

    return positions;
  }, []);

  useFrame((state) => {
    if (points.current) {
      points.current.rotation.y = state.clock.elapsedTime * 0.05;
      points.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.03) * 0.2;
    }
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.02}
        color={vanguardTheme.colors.orb.shimmer}
        transparent
        opacity={0.6 * intensity}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

// Ripple effect component
const Ripple: React.FC<{ position: THREE.Vector3; onComplete: () => void }> = ({ position, onComplete }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [scale, setScale] = useState(0.1);
  const [opacity, setOpacity] = useState(1);

  useFrame((state, delta) => {
    if (meshRef.current) {
      const newScale = scale + delta * 8;
      const newOpacity = Math.max(0, 1 - newScale / 4);

      setScale(newScale);
      setOpacity(newOpacity);

      meshRef.current.scale.set(newScale, newScale, 0.1);

      if (newOpacity <= 0) {
        onComplete();
      }
    }
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[0, 0, 0]}>
      <ringGeometry args={[0.8, 1, 64]} />
      <meshBasicMaterial
        color={vanguardTheme.colors.ui.accent.ripple}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
};

// Main orb component
const OrbMesh: React.FC<OrbProps> = ({ isListening, isSpeaking, audioLevel = 0, onClick, particleCount = 10000 }) => {
  const orbRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const [ripples, setRipples] = useState<{ id: number; position: THREE.Vector3 }[]>([]);
  const { camera, mouse } = useThree();

  // Handle click interactions
  const handlePointerDown = (e: any) => {
    e.stopPropagation();

    // Add ripple at click position
    const newRipple = {
      id: Date.now(),
      position: e.point,
    };
    setRipples(prev => [...prev, newRipple]);

    if (onClick) onClick();
  };

  const removeRipple = (id: number) => {
    setRipples(prev => prev.filter(r => r.id !== id));
  };

  // Animate the orb based on state
  useFrame((state) => {
    if (orbRef.current) {
      const time = state.clock.elapsedTime;

      // Base rotation
      orbRef.current.rotation.y = time * 0.1;
      orbRef.current.rotation.x = Math.sin(time * 0.2) * 0.1;

      // Breathing effect
      const baseScale = 1.0;
      const breathingScale = Math.sin(time * 0.5) * 0.05;
      const speakingScale = isSpeaking ? Math.sin(time * 8) * 0.1 * audioLevel : 0;
      const listeningScale = isListening ? Math.sin(time * 2) * 0.08 : 0;

      const scale = baseScale + breathingScale + speakingScale + listeningScale;
      orbRef.current.scale.setScalar(scale);
    }

    if (glowRef.current) {
      const time = state.clock.elapsedTime;
      glowRef.current.rotation.z = -time * 0.05;

      // Pulsing glow when speaking
      const glowScale = isSpeaking ? 1.2 + Math.sin(time * 10) * 0.2 * audioLevel : 1.1;
      glowRef.current.scale.setScalar(glowScale);
    }
  });

  // Dynamic colors based on state
  const orbColor = useMemo(() => {
    if (isSpeaking) return vanguardTheme.colors.orb.pulse;
    if (isListening) return vanguardTheme.colors.secondary.teal;
    return vanguardTheme.colors.primary.burgundy;
  }, [isSpeaking, isListening]);

  return (
    <group>
      {/* Outer glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[2.5, 32, 32]} />
        <meshBasicMaterial
          color={orbColor}
          transparent
          opacity={0.05}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Main orb - head-shaped - Very transparent to show particles */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <mesh
          ref={orbRef}
          onPointerDown={handlePointerDown}
          castShadow
          scale={[1.0, 1.15, 0.9]}  // Make it taller and narrower for head shape
        >
          <sphereGeometry args={[1.5, 64, 64]} />
          <MeshDistortMaterial
            color={orbColor}
            metalness={0.1}
            roughness={0.1}
            distort={0.1}
            speed={2}
            transparent
            opacity={0.1}
            emissive={orbColor}
            emissiveIntensity={isSpeaking ? 0.2 : 0.1}
            wireframe={false}
          />
        </mesh>
      </Float>

      {/* Inner core - barely visible */}
      <mesh scale={[1.0, 1.15, 0.9]}>
        <sphereGeometry args={[0.8, 32, 32]} />
        <meshBasicMaterial
          color={vanguardTheme.colors.orb.pulse}
          transparent
          opacity={0.1}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Eye glows - left eye - subtle guide for particles */}
      <mesh position={[-0.5, 0.4, 1.2]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial
          color={isListening ? '#00FFFF' : vanguardTheme.colors.orb.shimmer}
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Eye glows - right eye */}
      <mesh position={[0.5, 0.4, 1.2]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial
          color={isListening ? '#00FFFF' : vanguardTheme.colors.orb.shimmer}
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Mouth region glow */}
      {isSpeaking && (
        <mesh position={[0, -0.5, 1.3]} scale={[1.5, 0.8, 0.5]}>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshBasicMaterial
            color={vanguardTheme.colors.orb.pulse}
            transparent
            opacity={0.3 * audioLevel}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      {/* GPU-accelerated particle field */}
      <Suspense fallback={<ParticleField intensity={isSpeaking ? 1.5 : 1.0} />}>
        <GPUParticles
          count={particleCount}
          isListening={isListening}
          isSpeaking={isSpeaking}
          audioLevel={audioLevel}
        />
      </Suspense>

      {/* Render ripples */}
      {ripples.map(ripple => (
        <Ripple
          key={ripple.id}
          position={ripple.position}
          onComplete={() => removeRipple(ripple.id)}
        />
      ))}
    </group>
  );
};

// Container component with canvas
export const JackOrb: React.FC<OrbProps> = (props) => {
  return (
    <div className="jack-orb-container">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 50 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance"
        }}
      >
        <ambientLight intensity={0.2} />
        <pointLight position={[10, 10, 10]} intensity={0.5} />
        <pointLight position={[-10, -10, -10]} intensity={0.3} color={vanguardTheme.colors.secondary.navy} />

        <OrbMesh {...props} />

        {/* Background stars */}
        <fog attach="fog" args={['#0A0A0A', 5, 15]} />
      </Canvas>
    </div>
  );
};

export default JackOrb;