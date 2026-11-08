---
version: 2.0
name: Sanad Editorial Clinical Brutalism
description: Design tokens and visual language specification for Sanad (سند) Front Door. Editorial Clinical Brutalism — sharp architectural grid, Forest-Obsidian & Mineral Stone palette, zero purple, zero AI-slop.
colors:
  background: "#F3F4F1"
  surface: "#FFFFFF"
  surfaceAlt: "#E6EAE4"
  ink: "#0B1310"
  inkMuted: "#3F4E48"
  inkSubtle: "#63736C"
  primary: "#0F523E"
  primaryHover: "#093B2C"
  primarySurface: "#E6F2EE"
  signal: "#C84B31"
  signalSurface: "#FDF2EF"
  border: "#0B1310"
  borderMuted: "#C5CEC9"
  emergency: "#B91C1C"
  emergencySurface: "#FEF2F2"
  emergencyBorder: "#F87171"
  warning: "#B45309"
  warningSurface: "#FFFBEB"
  mockText: "#0B1310"
  mockBackground: "#E6EAE4"
  mockBorder: "#0B1310"
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: 800
    lineHeight: 1.06
    letterSpacing: -0.035em
  h1:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.025em
  h2:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.015em
  body:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  bodySmall:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.06em
rounded:
  none: 0px
  xs: 2px
  full: 9999px
spacing:
  s1: 4px
  s2: 8px
  s3: 12px
  s4: 16px
  s5: 24px
  s6: 32px
  s7: 48px
  s8: 64px
components:
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.xs}"
    padding: "{spacing.s5}"
  buttonPrimary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.xs}"
    padding: "12px 24px"
  buttonSecondary:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xs}"
    padding: "12px 24px"
  mockBadge:
    backgroundColor: "{colors.mockBackground}"
    borderColor: "{colors.mockBorder}"
    textColor: "{colors.mockText}"
    rounded: "{rounded.xs}"
---

# Sanad Design Specification (DESIGN.md)

## Overview
Sanad (سند) is a confidential digital front door for men's health research. Its visual language uses **Editorial Clinical Brutalism**: an architectural dossier layout with exposed structural hairlines, crisp `2px` geometry, mineral stone surfaces (`#F3F4F1`), deep forest-obsidian ink (`#0B1310`), and locked forest-emerald interactive accents (`#0F523E`).

- **Design Read:** Research-grade men's health front door and clinical simulation console with an Editorial Clinical Brutalist language, leaning toward Swiss architectural grids, tactile press physics, and strict anti-slop discipline.
- **Three Dials:** `DESIGN_VARIANCE: 8` · `MOTION_INTENSITY: 6` · `VISUAL_DENSITY: 5`

## Colors
- **Mineral Stone (`#F3F4F1`):** Calm, non-clinical-white paper base that avoids sterile hospital clichés and banned beige/brass tropes.
- **Obsidian Forest (`#0B1310`):** High-contrast ink ($\ge 14:1$) and structural grid border color.
- **Deep Forest Emerald (`#0F523E`):** Locked primary interactive accent across the entire experience.
- **Clinical Crimson (`#B91C1C`):** Reserved strictly for always-reachable Emergency Guidance and Quick Exit controls.
- **Zero Purple:** Complete ban on indigo, violet, lavender, or gradient mesh glows.

## Typography
- **Display & UI:** `Plus Jakarta Sans` (`700`/`800` for architectural headers, `400`/`500` for body copy at $\ge 16\text{px}$).
- **Telemetry & Audit Metadata:** `JetBrains Mono` for case versions, rule IDs (`[DRAFT-STEROID-01]`), and verification provenance.

## Layout
- **Asymmetric Architectural Ledger:** Breaks the standard 50/50 split and 3-equal-card clichés. Uses exposed 12-column Swiss dossier grids with numbered clinical stages, photography panels, and interactive case launchpads.
- **Viewport Stability:** Uses `min-h-[100dvh]`, never `h-screen`. Top hero padding capped at `pt-12` on desktop.

## Elevation & Depth
- **Tactile Brutalist Planes:** Crisp `1px` and `2px` solid structural borders (`#0B1310`) with hard offset shadows (`4px 4px 0px #0B1310`) on primary interactive modules and physical `:active` translation (`translate(1px, 1px)`).

## Shapes
- **Shape Consistency Lock:** All cards, buttons, inputs, and badges use sharp `2px` corners (`rounded-[2px]`). Zero mixed pill-and-rounded-2xl collisions.

## Components
- **MockBadge:** Prominent architectural stamp (`MOCK · SIMULATED DATA`) on every simulated view, review item, and referral record.
- **UrgentLink:** Plain HTML `<a href="/urgent.html">` banner and nav control, reachable without consent and cached for offline use.
- **QuickExit:** Instant synchronous DOM wipe, `sessionStorage`/`localStorage` purge, `/api/session/end` beacon, and `about:blank` redirect.

## Do's and Don'ts
- **Do** keep `UNKNOWN`, `NOT_ASKED`, and `DECLINED` visually and semantically distinct.
- **Do** maintain neutral language ("men's health", never "infertility").
- **Don't** use em-dashes, AI-purple gradients, fake div screenshots, or >1 eyebrow per 3 sections.
- **Don't** claim clinical validation, `PROVIDER_VERIFIED`, or `CARE_COMPLETED`.
