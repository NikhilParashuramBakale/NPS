import base64
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .config import settings


@dataclass(frozen=True)
class PakeOptions:
    server_id: str
    kdf_aad: str
    scrypt_n: int
    scrypt_r: int
    scrypt_p: int


def _pake_options() -> PakeOptions:
    return PakeOptions(
        server_id=settings.pake_server_id,
        kdf_aad=settings.pake_kdf_aad,
        scrypt_n=settings.pake_scrypt_n,
        scrypt_r=settings.pake_scrypt_r,
        scrypt_p=settings.pake_scrypt_p,
    )


def generate_salt() -> str:
    return base64.urlsafe_b64encode(os.urandom(16)).decode("ascii").rstrip("=")


def _run_pake_cli(payload: dict) -> dict:
    cli_path = Path(__file__).resolve().parents[1] / "pake_cli.cjs"
    if not cli_path.exists():
        raise RuntimeError("PAKE CLI script not found")

    raw = json.dumps(payload).encode("utf-8")
    result = subprocess.run(
        ["node", str(cli_path)],
        input=raw,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="ignore")
        raise RuntimeError(f"PAKE CLI failed: {stderr or result.stdout.decode('utf-8', errors='ignore')}")

    try:
        return json.loads(result.stdout.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("PAKE CLI returned invalid JSON") from exc


def compute_verifier(password: str, salt: str, client_id: str) -> str:
    options = _pake_options()
    payload = {
        "action": "verifier",
        "password": password,
        "salt": salt,
        "client_id": client_id,
        "server_id": options.server_id,
        "mhf": {"n": options.scrypt_n, "r": options.scrypt_r, "p": options.scrypt_p},
        "kdf_aad": options.kdf_aad,
    }
    data = _run_pake_cli(payload)
    return data["verifier"]


def start_pake(verifier: str, client_id: str) -> dict:
    options = _pake_options()
    payload = {
        "action": "start",
        "verifier": verifier,
        "client_id": client_id,
        "server_id": options.server_id,
        "mhf": {"n": options.scrypt_n, "r": options.scrypt_r, "p": options.scrypt_p},
        "kdf_aad": options.kdf_aad,
    }
    return _run_pake_cli(payload)


def finish_pake(server_state: str, client_msg: str, confirm_a: str) -> dict:
    options = _pake_options()
    payload = {
        "action": "finish",
        "server_state": server_state,
        "client_msg": client_msg,
        "confirm_a": confirm_a,
        "kdf_aad": options.kdf_aad,
    }
    return _run_pake_cli(payload)


def pake_public_config() -> dict:
    options = _pake_options()
    return {
        "server_id": options.server_id,
        "mhf": {"n": options.scrypt_n, "r": options.scrypt_r, "p": options.scrypt_p},
        "kdf_aad": options.kdf_aad,
    }
