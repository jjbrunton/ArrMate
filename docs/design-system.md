# ArrMate Design System

## Positioning
ArrMate is not a generic admin panel. It is an operations cockpit for Sonarr and Radarr. The UI should feel:

- Punchy: high-contrast, decisive, and fast to scan.
- Sexy: polished surfaces, strong typography, restrained glow, and atmospheric depth.
- Consistent: the same rules for spacing, status, hierarchy, and interaction everywhere.

## Product References
Use these as directional references, not copy targets:

- Linear: disciplined hierarchy, crisp typography, compact controls.
- Vercel dashboard: dark surfaces with subtle depth and strong information grouping.
- Tailscale admin: clean operational clarity and approachable system status.
- Sentry and Datadog: issue and timeline views that privilege signal over decoration.

## Current Design Review
Before the redesign, the application had a solid starting point but four weaknesses:

1. Color and spacing were defined inline per component, so the product looked assembled rather than authored.
2. The shell was functional but generic: flat dark zinc panels, limited hierarchy, and no brand atmosphere.
3. Operational screens mixed different interaction densities. Cards, tables, filters, and empty states did not feel like one family.
4. Mobile layout was under-considered. The fixed sidebar worked on desktop but broke the shell on smaller screens.

## Visual Direction
The ArrMate system uses a "midnight control room" aesthetic:

- Background: deep navy-black with cool cyan and blue atmospheric light.
- Accent: electric cyan for primary actions and branded emphasis.
- State colors:
  - Success: emerald
  - Warning: amber
  - Critical: rose
  - Info: cyan
- Surfaces:
  - `surface-0`: inset wells and scroll regions
  - `surface-1`: base panels
  - `surface-2`: elevated cards
  - `surface-3`: stronger feature panels and hero blocks

## Typography
- Primary: `Space Grotesk`
  - Use for page titles, section headings, and control labels.
  - Tight tracking and heavier weights are intentional.
- Mono: `IBM Plex Mono`
  - Use for timestamps, tiny labels, and operational metadata.

Rules:

- Titles should feel deliberate, not oversized.
- Labels and metadata should be calmer than primary content.
- Avoid mixing too many font sizes in one component.

## Layout Rules
- Use the shell as a product frame, not a blank canvas.
- Every page should start with a hero or section block that explains the purpose of the screen.
- Group controls with the information they act on.
- Prefer 16-24px spacing between related blocks and 24-32px between major sections.
- On mobile, prefer stacked controls and a bottom navigation pattern over squeezed side rails.
- Persistent shell chrome should stay compact. Brand areas should use a logo or wordmark, not a tagline, version badge, or design-note copy.

## Component Rules
### Buttons
- Primary buttons use the cyan accent and should be reserved for the main action on a surface.
- Outline buttons are for secondary but still meaningful actions.
- Ghost buttons are for low-emphasis actions only.
- If a card is intended to drill into a detailed screen, expose that navigation as a labeled primary button rather than an unlabeled icon.

### Cards
- Cards should always feel elevated from the page background.
- Important cards can use a stronger border or top highlight, but avoid rainbow treatment.

### Badges
- Badges are semantic and compact.
- Use uppercase mono-like presentation for system state and labels.

### Forms
- Inputs and selects should share height, radius, and focus treatment.
- Labels should be consistent and medium-emphasis.
- Validation and connection feedback should appear inside framed support areas, not as loose text.

### Tables and Timelines
- Dense surfaces still need rhythm:
  - quiet header
  - clear hover state
  - consistent row borders
  - muted metadata
- Use badges and inline summaries to avoid raw text walls.

### Empty States
- Empty states should feel intentional, not like missing content.
- Use framed containers, one strong sentence, and one clarifying sentence.

## Interaction Rules
- Focus states use cyan rings and should be visible everywhere.
- Hover states can lift slightly on important controls, but motion should stay subtle.
- Animations should support hierarchy, not distract from it.

## Implementation Notes
The design system is implemented through:

- global tokens and panel utilities in [src/app/globals.css](/Users/jjbrunton/Projects/ArrMate/src/app/globals.css)
- shell structure in [src/app/layout.tsx](/Users/jjbrunton/Projects/ArrMate/src/app/layout.tsx)
- shared browser icon asset in [src/app/icon.svg](/Users/jjbrunton/Projects/ArrMate/src/app/icon.svg), matching the shell logo mark
- shared primitives in [src/components/ui](/Users/jjbrunton/Projects/ArrMate/src/components/ui)
- page framing via [src/components/layout/page-hero.tsx](/Users/jjbrunton/Projects/ArrMate/src/components/layout/page-hero.tsx)

## Future Guardrails
- Do not introduce raw `zinc-*` and `blue-*` utility combinations for new components unless a token does not already exist.
- Add to the shared primitives before creating another one-off component style.
- Keep dashboards and issue views dense, but never noisy.
- If a screen starts to feel like a settings page, reintroduce hierarchy and state-driven emphasis.
