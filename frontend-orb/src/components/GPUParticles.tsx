import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Simulation shader - computes particle positions on GPU
const simulationVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const simulationFragmentShader = `
uniform sampler2D positions;
uniform float uTime;
uniform float uSpeed;
uniform float uCurlFreq;
uniform float uAudioLevel;
uniform vec3 uOrbCenter;
uniform float uOrbRadius;
uniform float uIsSpeaking;

varying vec2 vUv;

#define PI 3.1415926538

// Simplex 3D noise
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1. + 3.0 * C.xxx;

  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// Curl noise for organic movement
vec3 curl(vec3 p) {
  const float e = 0.1;

  float n1 = snoise(vec3(p.x, p.y + e, p.z));
  float n2 = snoise(vec3(p.x, p.y - e, p.z));
  float n3 = snoise(vec3(p.x, p.y, p.z + e));
  float n4 = snoise(vec3(p.x, p.y, p.z - e));
  float n5 = snoise(vec3(p.x + e, p.y, p.z));
  float n6 = snoise(vec3(p.x - e, p.y, p.z));

  float x = n2 - n1 + n4 - n3;
  float y = n4 - n3 + n6 - n5;
  float z = n6 - n5 + n2 - n1;

  return normalize(vec3(x, y, z));
}

// Define facial feature regions
float getRegionWeight(vec3 pos, vec3 center, float radius) {
  float dist = length(pos - center);
  return smoothstep(radius, 0.0, dist);
}

void main() {
  vec2 uv = vUv;
  vec3 pos = texture2D(positions, uv).rgb;
  
  // Initialize if empty (first frame)
  if (length(pos) < 0.001) {
     // This shouldn't happen if we initialize the texture correctly, 
     // but as a fallback we can just return 0,0,0 or noise
  }

  // Time-based movement
  float t = uTime * 0.5 * uSpeed;

  // Define facial regions (in head-like shape)
  vec3 leftEye = vec3(-0.5, 0.4, 1.2);
  vec3 rightEye = vec3(0.5, 0.4, 1.2);
  vec3 mouth = vec3(0.0, -0.5, 1.3);

  // Calculate region influences
  float leftEyeInfluence = getRegionWeight(pos, leftEye, 0.4);
  float rightEyeInfluence = getRegionWeight(pos, rightEye, 0.4);
  float mouthInfluence = getRegionWeight(pos, mouth, 0.6);

  // Apply curl noise for organic movement
  vec3 curlPos = pos;

  // Reduce movement in eye regions for stability
  float eyeStability = max(leftEyeInfluence, rightEyeInfluence);
  float movementScale = 1.0 - eyeStability * 0.7;

  curlPos += curl(pos * uCurlFreq + t) * 0.5 * movementScale;
  curlPos += curl(pos * uCurlFreq * 2.0 + t) * 0.25 * movementScale;
  curlPos += curl(pos * uCurlFreq * 4.0 + t) * 0.125 * movementScale;

  // Mouth animation when speaking
  if (uIsSpeaking > 0.5) {
    float mouthAnimation = sin(uTime * 15.0) * uAudioLevel;
    curlPos.y += mouthInfluence * mouthAnimation * 0.3;

    // Add lip sync effect - particles near mouth move more vertically
    float lipSync = sin(uTime * 20.0 + pos.x * 5.0) * mouthInfluence * uAudioLevel;
    curlPos.y += lipSync * 0.2;
  }

  // Eye blink simulation (occasional)
  float blinkCycle = mod(uTime * 0.3, 10.0);
  float blink = smoothstep(9.5, 9.7, blinkCycle) * (1.0 - smoothstep(9.7, 9.9, blinkCycle));
  if (leftEyeInfluence > 0.5 || rightEyeInfluence > 0.5) {
    curlPos.z -= blink * 0.3;
    curlPos.y -= blink * 0.1;
  }

  // Shape into head-like ellipsoid (slightly flattened sphere)
  vec3 ellipsoidScale = vec3(1.0, 1.1, 0.9);
  
  // Attract back to original shape to prevent exploding
  // We don't have "original" position here easily unless we pass it as another texture or attribute.
  // Instead, we can attract to the ellipsoid surface.
  
  vec3 targetPos = normalize(curlPos / ellipsoidScale) * ellipsoidScale * uOrbRadius;
  
  // Audio reactivity - expand/contract based on audio level
  float audioInfluence = 1.0 + uAudioLevel * 0.2;
  if (mouthInfluence > 0.1 && uIsSpeaking > 0.5) {
    audioInfluence += mouthInfluence * uAudioLevel * 0.3;
  }
  targetPos *= audioInfluence;

  // Mix between current curl position and target "home" position to keep shape
  float mixAmount = 0.1; // Strength of return to shape
  vec3 finalPos = mix(curlPos, targetPos, mixAmount);

  gl_FragColor = vec4(finalPos, 1.0);
}
`;

// Particle rendering shader
const particleVertexShader = `
uniform sampler2D positions;
uniform float uPointSize;
uniform float uTime;
uniform float uAudioLevel;

attribute vec3 color;
varying vec3 vColor;
varying float vIntensity;

void main() {
  vColor = color;

  vec3 pos = texture2D(positions, position.xy).xyz;

  // Define eye regions for enhanced glow
  vec3 leftEye = vec3(-0.5, 0.4, 1.2);
  vec3 rightEye = vec3(0.5, 0.4, 1.2);

  // Calculate distance to eye regions
  float leftEyeDist = length(pos - leftEye);
  float rightEyeDist = length(pos - rightEye);
  float eyeGlow = 0.0;

  // Create bright glow in eye regions
  if (leftEyeDist < 0.5 || rightEyeDist < 0.5) {
    eyeGlow = 1.0 - smoothstep(0.0, 0.5, min(leftEyeDist, rightEyeDist));
    vIntensity = 0.7 + eyeGlow * 0.3;

    // Subtle eye sparkle effect
    vIntensity += sin(uTime * 8.0 + pos.x * 10.0) * eyeGlow * 0.1;
  } else {
    // Regular intensity for non-eye regions
    float distFromCenter = length(pos);
    vIntensity = 1.0 - smoothstep(0.0, 3.0, distFromCenter);
    vIntensity *= 0.5 + sin(uTime * 2.0 + distFromCenter * 3.0) * 0.5;
  }

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Dynamic point size - eyes get slightly larger particles
  float baseSize = eyeGlow > 0.0 ? 1.3 : 1.0;
  float audioSize = 1.0 + uAudioLevel * 2.0;
  gl_PointSize = (uPointSize * baseSize * audioSize * vIntensity) / -mvPosition.z;
}
`;

const particleFragmentShader = `
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uTime;

varying vec3 vColor;
varying float vIntensity;

void main() {
  // Create circular particles
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);

  if (dist > 0.5) discard;

  // Soft edges
  float alpha = smoothstep(0.5, 0.0, dist);

  // Color gradient based on intensity
  vec3 color = mix(uColor1, uColor2, vIntensity);

  // Add shimmer effect
  float shimmer = sin(uTime * 10.0 + vIntensity * 20.0) * 0.2 + 0.8;

  gl_FragColor = vec4(color * shimmer, alpha * vIntensity);
}
`;

interface GPUParticlesProps {
  count?: number;
  isListening?: boolean;
  isSpeaking?: boolean;
  audioLevel?: number;
}

// FBO-based GPU particle system
export const GPUParticles: React.FC<GPUParticlesProps> = ({
  count = 10000,
  isListening = false,
  isSpeaking = false,
  audioLevel = 0,
}) => {
  const { gl } = useThree();
  const simulationMaterialRef = useRef<THREE.ShaderMaterial>();
  const renderMaterialRef = useRef<THREE.ShaderMaterial>();
  const fboRef = useRef<any>();
  const particlesRef = useRef<THREE.Points>(null);
  const frameRef = useRef(0);

  // Calculate texture dimensions for particle count
  const textureSize = useMemo(() => {
    return Math.ceil(Math.sqrt(count));
  }, [count]);

  // Initialize FBO system
  const initFBO = useMemo(() => {
    // Create data texture with initial particle positions
    const data = new Float32Array(textureSize * textureSize * 4);

    for (let i = 0; i < textureSize * textureSize; i++) {
      const i4 = i * 4;

      // Create head-like ellipsoid distribution with facial regions
      const r = Math.random();

      // 30% chance to concentrate in eye regions
      if (r < 0.3) {
        const isLeftEye = Math.random() > 0.5;
        const eyeX = isLeftEye ? -0.5 : 0.5;
        const eyeY = 0.4;
        const eyeZ = 1.2;

        // Create dense particle cloud around eyes
        const spread = 0.3;
        data[i4 + 0] = eyeX + (Math.random() - 0.5) * spread;
        data[i4 + 1] = eyeY + (Math.random() - 0.5) * spread;
        data[i4 + 2] = eyeZ + (Math.random() - 0.5) * spread;
      }
      // 20% chance to concentrate in mouth region
      else if (r < 0.5) {
        const mouthX = 0.0;
        const mouthY = -0.5;
        const mouthZ = 1.3;

        // Create wider spread for mouth area
        const spreadX = 0.6;
        const spreadY = 0.3;
        const spreadZ = 0.3;
        data[i4 + 0] = mouthX + (Math.random() - 0.5) * spreadX;
        data[i4 + 1] = mouthY + (Math.random() - 0.5) * spreadY;
        data[i4 + 2] = mouthZ + (Math.random() - 0.5) * spreadZ;
      }
      // Rest distributed in head-like ellipsoid
      else {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const radius = Math.cbrt(Math.random()) * 1.8;

        // Ellipsoid shape (slightly flattened sphere)
        const ellipsoidScale = [1.0, 1.1, 0.9];
        data[i4 + 0] = radius * Math.sin(phi) * Math.cos(theta) * ellipsoidScale[0];
        data[i4 + 1] = radius * Math.sin(phi) * Math.sin(theta) * ellipsoidScale[1];
        data[i4 + 2] = radius * Math.cos(phi) * ellipsoidScale[2];
      }

      data[i4 + 3] = 1.0;
    }

    const positionsTexture = new THREE.DataTexture(
      data,
      textureSize,
      textureSize,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    positionsTexture.needsUpdate = true;

    // Create TWO render targets for ping-pong
    const renderTargetA = new THREE.WebGLRenderTarget(textureSize, textureSize, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      generateMipmaps: false,
    });

    const renderTargetB = renderTargetA.clone();

    // Simulation material
    const simulationMaterial = new THREE.ShaderMaterial({
      uniforms: {
        positions: { value: positionsTexture },
        uTime: { value: 0 },
        uSpeed: { value: 0.5 },
        uCurlFreq: { value: 2.0 },
        uAudioLevel: { value: 0 },
        uOrbCenter: { value: new THREE.Vector3(0, 0, 0) },
        uOrbRadius: { value: 2.0 },
        uIsSpeaking: { value: 0 },
      },
      vertexShader: simulationVertexShader,
      fragmentShader: simulationFragmentShader,
    });

    // Create simulation scene
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      simulationMaterial
    );
    scene.add(mesh);

    return {
      scene,
      camera,
      renderTargetA,
      renderTargetB,
      positionsTexture,
      simulationMaterial,
    };
  }, [textureSize]);

  // Create particle geometry
  const particleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();

    // Positions (UV coordinates for texture lookup)
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // UV coordinates for texture lookup
      positions[i3 + 0] = (i % textureSize) / textureSize;
      positions[i3 + 1] = Math.floor(i / textureSize) / textureSize;
      positions[i3 + 2] = 0;

      // Random colors for variety
      const hue = Math.random() * 0.1 + 0.05; // Gold/orange range
      colors[i3 + 0] = hue;
      colors[i3 + 1] = hue * 0.8;
      colors[i3 + 2] = hue * 0.2;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    return geometry;
  }, [count, textureSize]);

  // Render material for particles
  const renderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        positions: { value: null },
        uPointSize: { value: 30.0 },
        uTime: { value: 0 },
        uAudioLevel: { value: 0 },
        uColor1: { value: new THREE.Color('#FFB81C') }, // Gold
        uColor2: { value: new THREE.Color('#8B2332') }, // Burgundy
      },
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  // Store refs
  useEffect(() => {
    simulationMaterialRef.current = initFBO.simulationMaterial;
    renderMaterialRef.current = renderMaterial;
    fboRef.current = initFBO;

    // Initial render to populate targets
    if (gl && initFBO) {
      gl.setRenderTarget(initFBO.renderTargetA);
      gl.clear();
      // Render initial positions
      initFBO.simulationMaterial.uniforms.positions.value = initFBO.positionsTexture;
      gl.render(initFBO.scene, initFBO.camera);
      gl.setRenderTarget(null);

      // Copy to B
      gl.setRenderTarget(initFBO.renderTargetB);
      gl.clear();
      initFBO.simulationMaterial.uniforms.positions.value = initFBO.renderTargetA.texture;
      gl.render(initFBO.scene, initFBO.camera);
      gl.setRenderTarget(null);
    }
  }, [initFBO, renderMaterial, gl]);

  // Update particles each frame
  useFrame((state) => {
    if (!fboRef.current || !simulationMaterialRef.current || !renderMaterialRef.current) return;

    const time = state.clock.getElapsedTime();
    const frame = frameRef.current;

    // Update simulation uniforms
    simulationMaterialRef.current.uniforms.uTime.value = time;
    simulationMaterialRef.current.uniforms.uAudioLevel.value = audioLevel;
    simulationMaterialRef.current.uniforms.uSpeed.value = isSpeaking ? 0.8 : 0.3;
    simulationMaterialRef.current.uniforms.uCurlFreq.value = isListening ? 3.0 : 2.0;
    simulationMaterialRef.current.uniforms.uIsSpeaking.value = isSpeaking ? 1.0 : 0.0;

    // Ping-pong
    const input = frame % 2 === 0 ? fboRef.current.renderTargetA : fboRef.current.renderTargetB;
    const output = frame % 2 === 0 ? fboRef.current.renderTargetB : fboRef.current.renderTargetA;

    simulationMaterialRef.current.uniforms.positions.value = input.texture;

    // Run simulation
    gl.setRenderTarget(output);
    gl.clear();
    gl.render(fboRef.current.scene, fboRef.current.camera);
    gl.setRenderTarget(null);

    // Update render material
    renderMaterialRef.current.uniforms.positions.value = output.texture;
    renderMaterialRef.current.uniforms.uTime.value = time;
    renderMaterialRef.current.uniforms.uAudioLevel.value = audioLevel;
    renderMaterialRef.current.uniforms.uPointSize.value = 20.0 + audioLevel * 10.0;

    // Update colors based on state
    if (isSpeaking) {
      renderMaterialRef.current.uniforms.uColor1.value.set('#FFB81C'); // Gold
      renderMaterialRef.current.uniforms.uColor2.value.set('#FFD700'); // Bright gold
    } else if (isListening) {
      renderMaterialRef.current.uniforms.uColor1.value.set('#006778'); // Teal
      renderMaterialRef.current.uniforms.uColor2.value.set('#00A0B0'); // Light teal
    } else {
      renderMaterialRef.current.uniforms.uColor1.value.set('#8B2332'); // Burgundy
      renderMaterialRef.current.uniforms.uColor2.value.set('#A73344'); // Light burgundy
    }

    frameRef.current++;
  });

  return (
    <points ref={particlesRef} geometry={particleGeometry} material={renderMaterial} />
  );
};

export default GPUParticles;