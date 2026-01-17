/**
 * @ferni/react - Ferni Design System for React
 * 
 * Components with emotional intelligence built in.
 * 
 * @example
 * ```tsx
 * import { Avatar, Button, FerniProvider } from '@ferni/react';
 * 
 * function App() {
 *   return (
 *     <FerniProvider>
 *       <Avatar persona="ferni" />
 *       <Button>Hello World</Button>
 *     </FerniProvider>
 *   );
 * }
 * ```
 */

// Components
export { Avatar } from './components/Avatar';
export type { AvatarProps, AvatarState, Expression, PersonaId } from './components/Avatar';

export { Button } from './components/Button';
export type { ButtonProps } from './components/Button';

export { Toast, Toaster, toast } from './components/Toast';
export type { ToastProps } from './components/Toast';

export { Dialog, DialogHeader, DialogBody, DialogFooter } from './components/Dialog';
export type { DialogProps } from './components/Dialog';

export { Celebration, useCelebration } from './components/Celebration';
export type { CelebrationProps, CelebrationType } from './components/Celebration';

export { Waveform, useAudioIntensity } from './components/Waveform';
export type { WaveformProps, WaveformState } from './components/Waveform';

export { Input } from './components/Input';
export type { InputProps, InputType, InputSize } from './components/Input';

export { Card, CardHeader, CardBody, CardFooter } from './components/Card';
export type { CardProps, CardVariant, CardSize } from './components/Card';

export { Spinner } from './components/Spinner';
export type { SpinnerProps, SpinnerSize } from './components/Spinner';

export { Badge } from './components/Badge';
export type { BadgeProps, BadgeVariant, BadgeSize } from './components/Badge';

export { Tooltip } from './components/Tooltip';
export type { TooltipProps, TooltipPosition } from './components/Tooltip';

export { Textarea } from './components/Textarea';
export type { TextareaProps, TextareaSize } from './components/Textarea';

export { Select } from './components/Select';
export type { SelectProps, SelectOption, SelectSize } from './components/Select';

export { Switch } from './components/Switch';
export type { SwitchProps, SwitchSize } from './components/Switch';

// Icon
export { Icon, iconNames } from './components/Icon';
export type { IconProps, IconName, IconSize } from './components/Icon';

// Voice Indicator
export { VoiceIndicator } from './components/VoiceIndicator';
export type { VoiceIndicatorProps, VoiceState, TurnOwner } from './components/VoiceIndicator';

// AI Components
export { Uncertainty, ThinkingProcess, MemoryRecall, EmotionalMirror } from './components/AIComponents';
export type {
  UncertaintyProps,
  ThinkingProcessProps,
  ThinkingStep,
  MemoryRecallProps,
  MemoryItem,
  EmotionalMirrorProps,
} from './components/AIComponents';

// Emotion Hook
export { useEmotion, emotionStates } from './hooks/useEmotion';
export type { EmotionState, IntensityLevel, EmotionConfig, UseEmotionOptions, UseEmotionReturn } from './hooks/useEmotion';

// Accessibility Hooks
export {
  useReducedMotion,
  useHighContrast,
  useFocusTrap,
  useAnnounce,
  useKeyboardNav,
  useAccessibleDuration,
  VisuallyHidden,
} from './hooks/useA11y';

// Expression controller
export { 
  getExpressionState, 
  applyExpression, 
  interpolateExpressions,
  playMicroExpression,
  MICRO_EXPRESSIONS 
} from './components/AvatarExpressionController';

// Providers
export { FerniProvider, useFerni } from './providers/FerniProvider';
export type { FerniProviderProps, FerniContextValue } from './providers/FerniProvider';

// Hooks
export { usePersona, useAllPersonas } from './hooks/usePersona';
export type { PersonaConfig } from './hooks/usePersona';

export { useAnimation, useAnimationPreset, DURATION, EASING } from './hooks/useAnimation';
export type { AnimationConfig } from './hooks/useAnimation';

export { useCircadian, useGreeting } from './hooks/useCircadian';
export type { CircadianConfig, CircadianPeriod } from './hooks/useCircadian';

// Tokens (from design-system)
export * from './tokens';
