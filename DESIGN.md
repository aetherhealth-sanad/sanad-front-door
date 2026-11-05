---
name: Sanad Clinical Prestige
description: Design tokens and visual language specification for Sanad (سند) Front Door. Warm precision healthcare aesthetic, anti-slop, zero purple.
colors:
  background: "#f8fafc"
  surface: "#ffffff"
  surfaceAlt: "#f1f5f9"
  ink: "#0f172a"
  inkMuted: "#64748b"
  inkSubtle: "#94a3b8"
  primary: "#0284c7"
  primaryHover: "#0369a1"
  primarySurface: "#f0f9ff"
  border: "#e2e8f0"
  borderHover: "#cbd5e1"
  emergency: "#dc2626"
  emergencySurface: "#fef2f2"
  emergencyBorder: "#fecaca"
  warning: "#d97706"
  warningSurface: "#fffbeb"
  mockText: "#475569"
  mockBackground: "#f1f5f9"
  mockBorder: "#cbd5e1"
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.025em
  h1:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  h2:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.015em
  body:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
  bodySmall:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.02em
  citation:
    fontFamily: Newsreader
    fontSize: 15px
    fontWeight: 400
    fontStyle: italic
    lineHeight: 1.5
rounded:
  sm: 6px
  md: 10px
  lg: 16px
  btn: 8px
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
    rounded: "{rounded.lg}"
    padding: "{spacing.s5}"
  buttonPrimary:
    backgroundColor: "{colors.primary}"
    color: "#ffffff"
    rounded: "{rounded.btn}"
    padding: "10px 20px"
  buttonSecondary:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    color: "{colors.ink}"
    rounded: "{rounded.btn}"
    padding: "10px 20px"
  mockBadge:
    backgroundColor: "{colors.mockBackground}"
    borderColor: "{colors.mockBorder}"
    color: "{colors.mockText}"
    rounded: "{rounded.full}"
---

# Sanad Design Specification (DESIGN.md)

## Overview
Sanad (سند) is a confidential digital front door for men's reproductive and hormonal health. The visual language conveys calm clinical dignity, scientific rigor, privacy, and approachable clarity. It adheres strictly to **Taste Skill 2.5 (Anti-Slop)** and **Frontend Specialist Rules**.

## Colors & Philosophy
- **95% Neutral Interface:** White card surfaces (`#ffffff`) on warm slate background (`#f8fafc`).
- **Deep Near-Black Ink:** Slate-900 (`#0f172a`) ensures high contrast ($\ge 7:1$) without the harshness of `#000000`.
- **Primary Clinical Blue:** Sky-600 (`#0284c7`), avoiding cold medical cyan or generic AI violet/purple.
- **Strict Purple Ban:** Zero violet, lavender, magenta, or gradient mesh slop.
- **Safety Red:** Red-600 (`#dc2626`) reserved strictly for emergency guidance and high-stakes alerts.

## Typography
- **Primary Interface:** Plus Jakarta Sans — modern geometric clarity with open counters.
- **Editorial Citations & Scientific Disclaimers:** Newsreader (serif, italic) for clinical rule IDs, guidelines, and research prototype disclaimers.
- Paragraph text is strictly $\ge 16\text{px}$ with line-height $\ge 1.5$. No 14px paragraphs.

## Layout & Rhythm
- Mobile-first patient experience: centered content max-width 640px on mobile/tablet, responsive 12-column grid.
- Desktop Clinician Console: dual-pane review layout (patient context vs guideline decisions).
- Equal margins on left and right (`--gut`), strict mathematical spacing rhythm.

## Elevation & Depth
- Flat, tactile planes. No heavy drop-shadows or blurry glow effects.
- Cards elevate by `2px` on hover with a crisp 1px hairline border highlight.

## Components & Invariants
- **MockBadge:** Must be prominently visible on every simulated screen, case review, or referral item.
- **QuickExit:** Red or neutral high-contrast button present in the navigation bar on every patient screen.
- **UrgentLink:** Plain HTML anchor directly leading to `/urgent.html`, guaranteed to function offline.

## Do's and Don'ts
- **DO** use clear, neutral language ("men's health", not "infertility").
- **DO** show clear source attribution and rule IDs (e.g. `[DRAFT-STEROID-01] CLINICAL_TBD`).
- **DON'T** use purple gradients, floating cards with 40px blur, or generic AI chatter.
- **DON'T** make emergency guidance wait for network requests, models, or consent checks.
