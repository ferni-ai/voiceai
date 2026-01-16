import React, { forwardRef, useState, useId } from 'react';
import { personas, colors } from '../tokens';
import type { PersonaId } from './Avatar';

export type SwitchSize = 'sm' | 'md' | 'lg';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  /** Label text */
  label?: string;
  /** Description text */
  description?: string;
  /** Switch size */
  size?: SwitchSize;
  /** Persona color */
  persona?: PersonaId;
}

const SIZE_CONFIG = {
  sm: { track: { width: 36, height: 20 }, thumb: 16, translate: 16 },
  md: { track: { width: 44, height: 24 }, thumb: 20, translate: 20 },
  lg: { track: { width: 52, height: 28 }, thumb: 24, translate: 24 },
};

/**
 * Switch toggle component
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  {
    label,
    description,
    size = 'md',
    persona = 'ferni',
    disabled,
    checked,
    defaultChecked,
    onChange,
    className = '',
    style,
    ...props
  },
  ref
) {
  const [isChecked, setIsChecked] = useState(defaultChecked ?? false);
  const id = useId();
  const inputId = props.id || id;
  const sizeConfig = SIZE_CONFIG[size];
  const personaColor = personas[persona]?.colors?.primary || colors.ferni;

  const controlledChecked = checked !== undefined ? checked : isChecked;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (checked === undefined) {
      setIsChecked(e.target.checked);
    }
    onChange?.(e);
  };

  return (
    <label
      className={`ferni-switch-wrapper ${className}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
    >
      {/* Hidden input for accessibility */}
      <input
        ref={ref}
        type="checkbox"
        id={inputId}
        disabled={disabled}
        checked={controlledChecked}
        onChange={handleChange}
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
        {...props}
      />

      {/* Track */}
      <div
        className="ferni-switch-track"
        style={{
          position: 'relative',
          width: `${sizeConfig.track.width}px`,
          height: `${sizeConfig.track.height}px`,
          background: controlledChecked ? personaColor : colors.backgroundSubtle,
          borderRadius: `${sizeConfig.track.height}px`,
          transition: 'background 0.2s ease',
          flexShrink: 0,
        }}
      >
        {/* Thumb */}
        <div
          className="ferni-switch-thumb"
          style={{
            position: 'absolute',
            top: `${(sizeConfig.track.height - sizeConfig.thumb) / 2}px`,
            left: `${controlledChecked ? sizeConfig.translate : 2}px`,
            width: `${sizeConfig.thumb}px`,
            height: `${sizeConfig.thumb}px`,
            background: 'white',
            borderRadius: '50%',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
            transition: 'left 0.2s ease',
          }}
        />
      </div>

      {/* Label and description */}
      {(label || description) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {label && (
            <span
              style={{
                fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
                fontSize: '14px',
                fontWeight: 500,
                color: colors.textPrimary,
              }}
            >
              {label}
            </span>
          )}
          {description && (
            <span
              style={{
                fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)',
                fontSize: '13px',
                color: colors.textMuted,
              }}
            >
              {description}
            </span>
          )}
        </div>
      )}
    </label>
  );
});
