#!/usr/bin/env node
/**
 * Native Token Generator
 *
 * Generates Swift and Kotlin color tokens from design-system/tokens/colors.json
 * so the native apps stop hand-copying hex values (which drifted: three
 * platforms had Nayan in Jack's legacy brown).
 *
 * Outputs:
 *   apps/shared/Sources/FerniShared/Design/FerniTokens.generated.swift  (iOS, widgets, macOS via FerniShared)
 *   apps/android-native/.../ui/theme/FerniTokens.kt                     (Compose colors)
 *   apps/android-native/app/src/main/res/values/ferni_tokens.xml        (color resources)
 *
 * Text colors (persona inks, accent text, on-accent, semantic text) come from
 * utils/theme-inks.js, the same derivation build.js uses for the web, so every
 * one meets WCAG AA (4.5:1) on its theme's surfaces. `textOnDark` is kept for
 * existing call sites and equals the generated dark (midnight) ink.
 *
 * Usage: node design-system/generate-native-tokens.js  (part of pnpm tokens:sync)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildStamp } from './build/build-stamp.js';
import { computePersonaInks, withReadableThemeText } from './utils/theme-inks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(__dirname);

const colors = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/colors.json'), 'utf-8'));

const OUTPUTS = {
  sharedSwift: 'apps/shared/Sources/FerniShared/Design/FerniTokens.generated.swift',
  androidKotlin: 'apps/android-native/app/src/main/java/com/ferni/voice/ui/theme/FerniTokens.kt',
  androidXml: 'apps/android-native/app/src/main/res/values/ferni_tokens.xml',
};

// Theme colors exposed to native code: [name, path within a theme]
const THEME_COLORS = [
  ['backgroundPrimary', 'background.primary'],
  ['backgroundSecondary', 'background.secondary'],
  ['backgroundElevated', 'background.elevated'],
  ['textPrimary', 'text.primary'],
  ['textSecondary', 'text.secondary'],
  ['textMuted', 'text.muted'],
  ['textDimmed', 'text.dimmed'],
  ['accent', 'accent.primary'],
  ['accentHover', 'accent.hover'],
  ['accentPressed', 'accent.pressed'],
  ['success', 'semantic.success'],
  ['error', 'semantic.error'],
  ['warning', 'semantic.warning'],
  ['info', 'semantic.info'],
  // Generated text inks (utils/theme-inks.js): readable on every theme surface
  ['accentText', 'accent.text'],
  ['onAccent', 'text.onAccent'],
  ['successText', 'semantic.successText'],
  ['errorText', 'semantic.errorText'],
  ['warningText', 'semantic.warningText'],
  ['infoText', 'semantic.infoText'],
];

// Native apps ship a light and a dark theme
const LIGHT_THEME = 'zen';
const DARK_THEME = 'midnight';

// ============================================================================
// DATA
// ============================================================================

function get(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function hex6(value, label) {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`Expected #rrggbb for ${label}, got ${JSON.stringify(value)}`);
  }
  return value.slice(1).toLowerCase();
}

function alphaOf(rgba, fallback) {
  const m = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(rgba || '');
  return m ? Number(m[1]) : fallback;
}

function capitalize(s) {
  return s[0].toUpperCase() + s.slice(1);
}

const personaInks = computePersonaInks(colors.personas, colors.themes);
const readableThemes = withReadableThemeText(colors.themes);

const personas = Object.entries(colors.personas)
  .filter(([id]) => !id.startsWith('_'))
  .map(([id, p]) => {
    const inkDark = hex6(personaInks[id][DARK_THEME], `${id} ${DARK_THEME} ink`);
    return {
      id,
      note: (p._note || '').replace(/\s+/g, ' ').trim(),
      primary: hex6(p.primary, `${id}.primary`),
      secondary: hex6(p.secondary, `${id}.secondary`),
      // Backward-compatible name; the hand-picked colors.json value failed AA
      textOnDark: inkDark,
      inkDark,
      inkLight: hex6(personaInks[id][LIGHT_THEME], `${id} ${LIGHT_THEME} ink`),
      onFill: hex6(personaInks[id].onFill, `${id} onFill`),
      glowAlpha: alphaOf(p.glow, 0.28),
    };
  });

const themes = [LIGHT_THEME, DARK_THEME].map((name) => ({
  name,
  colors: THEME_COLORS.map(([key, dotted]) => [key, hex6(get(readableThemes[name], dotted), `${name}.${dotted}`)]),
}));

const header = (comment) =>
  [
    `${comment} GENERATED FILE - DO NOT EDIT.`,
    `${comment} Source: design-system/tokens/colors.json`,
    `${comment} Regenerate: pnpm tokens:sync (design-system/generate-native-tokens.js)`,
    `${comment} ${buildStamp()}`,
  ].join('\n');

// ============================================================================
// SWIFT
// ============================================================================

function swift({ access, withFerniColors }) {
  const pub = access ? `${access} ` : '';
  const out = [header('//'), '', 'import SwiftUI', ''];

  out.push('/// Raw hex values from the design tokens (use with `Color(hex:)`).');
  out.push(`${pub}enum FerniTokens {`);
  out.push(`    ${pub}enum Persona {`);
  for (const p of personas) {
    if (p.note) out.push(`        /// ${capitalize(p.id)}: ${p.note}`);
    out.push(`        ${pub}static let ${p.id}Primary: UInt = 0x${p.primary}`);
    out.push(`        ${pub}static let ${p.id}Secondary: UInt = 0x${p.secondary}`);
    out.push(`        /// Same as ${p.id}InkDark (kept for existing call sites)`);
    out.push(`        ${pub}static let ${p.id}TextOnDark: UInt = 0x${p.textOnDark}`);
    out.push(`        /// Text in ${capitalize(p.id)}'s color on dark (midnight) surfaces, WCAG AA`);
    out.push(`        ${pub}static let ${p.id}InkDark: UInt = 0x${p.inkDark}`);
    out.push(`        /// Text in ${capitalize(p.id)}'s color on light (zen) surfaces, WCAG AA`);
    out.push(`        ${pub}static let ${p.id}InkLight: UInt = 0x${p.inkLight}`);
    out.push(`        /// Text placed on the ${p.id}Primary fill`);
    out.push(`        ${pub}static let ${p.id}OnFill: UInt = 0x${p.onFill}`);
  }
  out.push('');
  out.push('        /// Primary color as "#rrggbb" (Ferni for unknown ids)');
  out.push(`        ${pub}static func primaryHexString(for id: String) -> String {`);
  out.push('            switch id.lowercased() {');
  for (const p of personas) out.push(`            case "${p.id}": return "#${p.primary}"`);
  out.push(`            default: return "#${personas.find((p) => p.id === 'ferni').primary}"`);
  out.push('            }');
  out.push('        }');
  out.push('    }');
  for (const theme of themes) {
    out.push('');
    out.push(`    /// ${theme.name === 'zen' ? 'Light (zen)' : 'Dark (midnight)'} theme`);
    out.push(`    ${pub}enum ${capitalize(theme.name)} {`);
    for (const [key, value] of theme.colors) out.push(`        ${pub}static let ${key}: UInt = 0x${value}`);
    out.push('    }');
  }
  out.push('}');

  if (withFerniColors) {
    out.push('');
    out.push('// MARK: - FerniColors (token-derived part; hand-written part in FerniColors.swift)');
    out.push('');
    out.push(`extension FerniColors {`);
    for (const p of personas) {
      if (p.note) out.push(`    /// ${capitalize(p.id)}: ${p.note}`);
      out.push(`    ${pub}static let ${p.id} = PersonaColor(`);
      out.push(`        primary: Color(hex: FerniTokens.Persona.${p.id}Primary),`);
      out.push(`        secondary: Color(hex: FerniTokens.Persona.${p.id}Secondary),`);
      out.push(`        textOnDark: Color(hex: FerniTokens.Persona.${p.id}TextOnDark),`);
      out.push(`        glow: Color(hex: FerniTokens.Persona.${p.id}Primary).opacity(${p.glowAlpha})`);
      out.push('    )');
    }
    for (const theme of themes) {
      const T = capitalize(theme.name);
      const alias = { backgroundPrimary: 'bgPrimary', backgroundSecondary: 'bgSecondary', backgroundElevated: 'bgElevated' };
      out.push('');
      out.push(`    ${pub}enum ${T} {`);
      for (const [key] of theme.colors) {
        out.push(`        ${pub}static let ${alias[key] || key} = Color(hex: FerniTokens.${T}.${key})`);
      }
      out.push('    }');
    }
    out.push('');
    out.push(`    ${pub}enum Semantic {`);
    for (const key of ['success', 'error', 'warning', 'info']) {
      out.push(`        ${pub}static let ${key} = Color(hex: FerniTokens.Zen.${key})`);
      out.push(`        ${pub}static let ${key}Dark = Color(hex: FerniTokens.Midnight.${key})`);
      out.push(`        /// ${capitalize(key)} as text (WCAG AA on the theme's surfaces)`);
      out.push(`        ${pub}static let ${key}Text = Color(hex: FerniTokens.Zen.${key}Text)`);
      out.push(`        ${pub}static let ${key}TextDark = Color(hex: FerniTokens.Midnight.${key}Text)`);
    }
    out.push('    }');
    out.push('');
    out.push('    /// Persona colors by id (Ferni for unknown ids)');
    out.push(`    ${pub}static func persona(for id: String) -> PersonaColor {`);
    out.push('        switch id.lowercased() {');
    for (const p of personas) out.push(`        case "${p.id}": return ${p.id}`);
    out.push('        default: return ferni');
    out.push('        }');
    out.push('    }');
    out.push('}');
  }
  return out.join('\n') + '\n';
}

// ============================================================================
// KOTLIN / XML
// ============================================================================

function kotlin() {
  const out = [header('//'), '', 'package com.ferni.voice.ui.theme', '', 'import androidx.compose.ui.graphics.Color', ''];
  out.push('object FerniTokens {');
  out.push('    object Persona {');
  for (const p of personas) {
    const P = capitalize(p.id);
    if (p.note) out.push(`        /** ${P}: ${p.note} */`);
    out.push(`        val ${P}Primary = Color(0xFF${p.primary})`);
    out.push(`        val ${P}Secondary = Color(0xFF${p.secondary})`);
    out.push(`        /** Same as ${P}InkDark (kept for existing call sites) */`);
    out.push(`        val ${P}TextOnDark = Color(0xFF${p.textOnDark})`);
    out.push(`        /** Text in ${P}'s color on dark (midnight) surfaces, WCAG AA */`);
    out.push(`        val ${P}InkDark = Color(0xFF${p.inkDark})`);
    out.push(`        /** Text in ${P}'s color on light (zen) surfaces, WCAG AA */`);
    out.push(`        val ${P}InkLight = Color(0xFF${p.inkLight})`);
    out.push(`        /** Text placed on the ${P}Primary fill */`);
    out.push(`        val ${P}OnFill = Color(0xFF${p.onFill})`);
  }
  out.push('');
  out.push('        /** Primary color as "#rrggbb" (Ferni for unknown ids) */');
  out.push('        fun primaryHex(id: String): String = when (id.lowercase()) {');
  for (const p of personas) out.push(`            "${p.id}" -> "#${p.primary}"`);
  out.push(`            else -> "#${personas.find((p) => p.id === 'ferni').primary}"`);
  out.push('        }');
  out.push('    }');
  for (const theme of themes) {
    out.push('');
    out.push(`    /** ${theme.name === 'zen' ? 'Light (zen)' : 'Dark (midnight)'} theme */`);
    out.push(`    object ${capitalize(theme.name)} {`);
    for (const [key, value] of theme.colors) out.push(`        val ${capitalize(key)} = Color(0xFF${value})`);
    out.push('    }');
  }
  out.push('}');
  return out.join('\n') + '\n';
}

function snake(s) {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function androidXml() {
  const out = ['<?xml version="1.0" encoding="utf-8"?>', header('<!--').replace(/\n<!--/g, ' -->\n<!--') + ' -->', '<resources>'];
  for (const p of personas) {
    out.push(`    <color name="persona_${p.id}_primary">#${p.primary}</color>`);
    out.push(`    <color name="persona_${p.id}_secondary">#${p.secondary}</color>`);
    out.push(`    <color name="persona_${p.id}_ink_dark">#${p.inkDark}</color>`);
    out.push(`    <color name="persona_${p.id}_ink_light">#${p.inkLight}</color>`);
    out.push(`    <color name="persona_${p.id}_on_fill">#${p.onFill}</color>`);
  }
  for (const theme of themes) {
    for (const [key, value] of theme.colors) out.push(`    <color name="${theme.name}_${snake(key)}">#${value}</color>`);
  }
  out.push('</resources>');
  return out.join('\n') + '\n';
}

// ============================================================================
// MAIN
// ============================================================================

function write(rel, content) {
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  console.log(`✅ ${rel}`);
}

console.log('📱 Generating native tokens...');
write(OUTPUTS.sharedSwift, swift({ access: 'public', withFerniColors: true }));
write(OUTPUTS.androidKotlin, kotlin());
write(OUTPUTS.androidXml, androidXml());
