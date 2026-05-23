"""Symmetric password vault — Fernet-encrypted at-rest.

Used so that school admins can recover an auto-generated password from a bulk
upload (until the user changes it themselves). Once the user changes their own
password, the encrypted copy is wiped — admin can only Reset (generate a fresh
auto password and reveal it once).

Key is derived from JWT_SECRET so we don't add another env variable.
"""
import os
import base64
import hashlib
import secrets
from cryptography.fernet import Fernet, InvalidToken


_fernet: Fernet | None = None


def _fernet_key() -> bytes:
    secret = os.environ["JWT_SECRET"].encode("utf-8")
    # SHA-256 → 32 bytes → urlsafe-b64 → 44 chars (Fernet-compatible)
    return base64.urlsafe_b64encode(hashlib.sha256(secret).digest())


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_fernet_key())
    return _fernet


def encrypt_password(plain: str) -> str:
    """Encrypt a plaintext password — returns a base64 token suitable for Mongo."""
    return _get_fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_password(token: str | None) -> str | None:
    """Decrypt a token. Returns None if missing or tampered with."""
    if not token:
        return None
    try:
        return _get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, Exception):
        return None


# Human-friendly password alphabets — no confusing chars (0/O, 1/l/I)
_SAFE_LETTERS_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
_SAFE_LETTERS_LOWER = "abcdefghjkmnpqrstuvwxyz"
_SAFE_DIGITS = "23456789"


def generate_password(length: int = 10) -> str:
    """Generate a strong, human-readable password.

    Guarantees at least 1 uppercase letter, 1 lowercase letter, 1 digit.
    Avoids visually confusing characters (0, O, 1, l, I).
    """
    if length < 6:
        length = 6
    rng = secrets.SystemRandom()
    pool = _SAFE_LETTERS_UPPER + _SAFE_LETTERS_LOWER + _SAFE_DIGITS
    chars = [
        rng.choice(_SAFE_LETTERS_UPPER),
        rng.choice(_SAFE_LETTERS_LOWER),
        rng.choice(_SAFE_DIGITS),
    ]
    chars += [rng.choice(pool) for _ in range(length - 3)]
    rng.shuffle(chars)
    return "".join(chars)
