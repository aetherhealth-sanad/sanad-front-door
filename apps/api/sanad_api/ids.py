"""Random identifiers. None of them carry personal data (AC-02.2)."""

import secrets


def new_id(prefix: str, nbytes: int = 4) -> str:
    return f"{prefix}-{secrets.token_hex(nbytes)}"


def new_case_id() -> str:
    return new_id("SANAD", 6)


def new_case_code() -> str:
    # A short code for the mock facility, so the operator never sees the case ID (API design 6.8).
    return f"C-{secrets.token_hex(3).upper()}"
