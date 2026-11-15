"""Reads one synthetic semen analysis report into a draft (RF-29, T-60, `PROPOSED`).

This package reads values. It never interprets them, writes a fact or an observation, keeps the
document, or logs anything it read. Every value it returns needs user confirmation. The
emergency modules must not import it (AC-29.12). Design: `specs/ocr-lab-report.md`.
"""
