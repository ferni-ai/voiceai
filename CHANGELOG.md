# Changelog

All notable changes to Ferni AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive documentation overhaul (README, API reference, architecture docs)
- ONBOARDING.md for new developer onboarding
- CONTRIBUTING.md with PR process and code standards
- BACKLOG.md for product roadmap tracking
- SDLC-AUDIT.md for architecture quality tracking
- Architecture Decision Records (ADRs) with template
- GitHub issue templates for features, bugs, and tech debt
- API authentication middleware (JWT + API keys)
- Input validation with Zod schemas across all API routes
- Handoff diagnostics dashboard

### Changed
- Migrated engagement-routes.js to TypeScript
- Updated all API routes to use `createLogger()` instead of `console.log`
- Improved CORS handling with configurable allowed origins

### Fixed
- Type safety improvements in habit-coaching modules
- Fixed TypeScript compilation errors in various service files

### Security
- Added authentication middleware to all API routes
- Implemented admin-only access for diagnostics endpoints
- Added rate limiting infrastructure (partial implementation)

---

## [1.0.0] - 2024-12-01

### Added
- Initial release of Ferni AI voice coaching platform
- 6 AI personas: Ferni, Alex Chen, Maya Santos, Peter John, Jordan Taylor, Nayan
- Multi-persona handoff system
- Context builder intelligence system (15+ builders)
- Persistent memory with Firestore
- Real-time voice with LiveKit + Gemini Live + Cartesia
- Subscription system with Stripe integration
- Team unlock progression system
- 100+ LLM tools organized by domain
- Spotify music integration
- Mobile apps (iOS/Android)
- Design system with CSS tokens
- Comprehensive test suite (60% coverage)

### Architecture
- Persona bundle architecture for extensible AI personalities
- Dependency injection container
- Result types for explicit error handling
- Context builder pattern for modular intelligence
- Tool registry pattern for LLM capabilities

---

## Version History Notes

### Versioning Policy
- **Major**: Breaking changes to API or architecture
- **Minor**: New features, non-breaking
- **Patch**: Bug fixes, performance improvements

### How to Update This File
1. Add changes under `[Unreleased]` as they're merged
2. When releasing, move `[Unreleased]` items to a new version section
3. Categories: Added, Changed, Deprecated, Removed, Fixed, Security

