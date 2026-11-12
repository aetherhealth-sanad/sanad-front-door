---
version: 3.0
name: Sanad Luxe Clinical Medical Design System
description: Visual design specification for Sanad (سند) Front Door based on Luxe Clinical Medical / Bio-Medical Glass style. Luminous ocean/sapphire atmosphere, floating 32px rounded master canvas, crisp clinical white & deep royal cards, glowing sapphire pills, zero purple slop.
colors:
  atmosphereGradient: "linear-gradient(155deg, #09479E 0%, #105AC2 45%, #1872E6 100%)"
  canvasBackground: "#FFFFFF"
  canvasBorder: "rgba(255, 255, 255, 0.65)"
  cardSurface: "#FFFFFF"
  cardBorder: "#E2ECF8"
  cardSapphireBackground: "linear-gradient(140deg, #13468D 0%, #0D336A 100%)"
  ink: "#072254"
  inkNavy: "#0F3D7C"
  inkSlate: "#4A6588"
  inkMuted: "#829AB8"
  sapphirePrimary: "#0066EE"
  sapphireHover: "#0050D0"
  sapphireSurface: "#EBF3FF"
  sapphireBorder: "#BCD8FE"
  emergencyRuby: "#D92D20"
  emergencySurface: "#FEF3F2"
  emergencyBorder: "#FECDCA"
  mockText: "#072254"
  mockBackground: "#EBF3FF"
  mockBorder: "#BCD8FE"
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: -0.03em
  h1:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  h2:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.01em
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
    letterSpacing: 0.04em
rounded:
  canvas: 28px
  card: 20px
  subcard: 14px
  pill: 9999px
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
  canvas:
    backgroundColor: "#FFFFFF"
    borderRadius: "28px"
    boxShadow: "0 25px 70px -15px rgba(2, 28, 80, 0.35)"
  card:
    backgroundColor: "#FFFFFF"
    borderColor: "#E2ECF8"
    borderRadius: "20px"
    boxShadow: "0 4px 18px -2px rgba(10, 42, 95, 0.05)"
  buttonPrimary:
    background: "linear-gradient(135deg, #0066EE 0%, #0044B8 100%)"
    textColor: "#FFFFFF"
    borderRadius: "9999px"
    boxShadow: "0 4px 16px -2px rgba(0, 102, 238, 0.4)"
  buttonSecondary:
    backgroundColor: "#FFFFFF"
    borderColor: "#0066EE"
    textColor: "#0066EE"
    borderRadius: "9999px"
  mockBadge:
    backgroundColor: "#EBF3FF"
    borderColor: "#BCD8FE"
    textColor: "#0050CC"
    borderRadius: "9999px"
---

# Sanad Design Specification (DESIGN.md v3.0)

## Overview
Sanad (سند) is a confidential digital front door for men's reproductive health research. Its visual language uses **Luxe Clinical Medical**: a radiant sapphire bio-atmosphere, floating 28px master white canvases, crisp clinical white surfaces paired with deep royal sapphire cards, and glowing pill controls.

- **Design Read:** High-end clinical front door inspired by modern bio-medical glass aesthetics. Pure, calm, ultra-clear typography with high trust factors.
- **Three Dials:** `DESIGN_VARIANCE: 7` · `MOTION_INTENSITY: 5` · `VISUAL_DENSITY: 5`

## Color Palette
- **Bio-Medical Atmosphere:** Luminous ambient ocean gradient (`#09479E` to `#1872E6`) with subtle cyan radial blooms.
- **Master Canvas (`#FFFFFF`):** Pure white inner ground floating with soft deep-sea shadow (`0 25px 70px -15px rgba(2, 28, 80, 0.35)`).
- **Clinical Ink (`#072254`):** High contrast navy ink for headings and key clinical data.
- **Clinical Slate (`#4A6588`):** Readable, calm supporting body text.
- **Glowing Sapphire (`#0066EE` / `#0044B8`):** Primary action pills and focus accents.
- **Deep Royal Sapphire (`#14468C` / `#0D336A`):** Premium contrasting cards for telemetry, session rails, and treatment meters.
- **Emergency Ruby (`#D92D20`):** Reserved for emergency guidance, warnings, and Quick Exit.
- **Zero Purple:** No generic AI purple gradients.

## Typography
- **Primary Font:** `Plus Jakarta Sans` (`700`/`800` for bold medical headings, `400`/`500` for body copy).
- **Code & Metadata:** `JetBrains Mono` for question IDs (`Q-BODY-FAT`), observation codes, and session timestamps.

## Shapes & Radii
- Master Canvas: `28px` rounded corners.
- Interactive Cards: `20px` rounded corners.
- Inputs & Chips: `12px - 14px` rounded corners.
- Buttons & Tags: `9999px` full pill shapes.

## Clinical Safety & Invariants
- **Mock Markers:** Every simulated view, fixture, and referral carries a visible **Mock** label (`is_mock: true`).
- **Emergency First:** Emergency path reachable from everywhere, offline, without consent.
- **Zero Em-Dashes:** Zero `—` or `–` characters in user-facing UI copy.
- **Neutral Terms:** Say "men's health", never "infertility".
