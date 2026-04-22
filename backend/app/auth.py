import base64
import hashlib
import hmac
import os
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from .config import settings


_ARGON2_HASHER = PasswordHasher()


def hash_password(password: str) -> str:
    return _ARGON2_HASHER.hash(password)


def _verify_legacy_pbkdf2(plain_password: str, password_hash: str) -> bool:
    algo, iter_str, salt_b64, digest_b64 = password_hash.split("$", 3)
    if algo != "pbkdf2_sha256":
        return False
    iterations = int(iter_str)
    salt = base64.b64decode(salt_b64.encode())
    expected = base64.b64decode(digest_b64.encode())
    actual = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        # New hashes are Argon2id and verified first.
        return _ARGON2_HASHER.verify(password_hash, plain_password)
    except VerifyMismatchError:
        return False
    except InvalidHashError:
        # Legacy seeded users may still have PBKDF2 hashes.
        try:
            return _verify_legacy_pbkdf2(plain_password, password_hash)
        except Exception:  # noqa: BLE001
            return False
    except Exception:  # noqa: BLE001
        return False


def needs_password_rehash(password_hash: str) -> bool:
    try:
        return _ARGON2_HASHER.check_needs_rehash(password_hash)
    except InvalidHashError:
        # Non-Argon2 hashes should be migrated.
        return True
    except Exception:  # noqa: BLE001
        return False


def create_access_token(subject: str, role: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_expire_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
