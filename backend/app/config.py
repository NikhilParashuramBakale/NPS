import os

from pydantic_settings import BaseSettings, SettingsConfigDict


def _env_files() -> tuple[str, str]:
    app_env = os.getenv("APP_ENV", "dev").lower()
    return (".env", f".env.{app_env}")


class Settings(BaseSettings):
    app_env: str = "dev"
    database_url: str = "sqlite:///./nps.db"
    jwt_secret: str = "dev-only-secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 120
    cors_origins: str = "http://localhost:5173"
    pake_server_id: str = "securecam-backend"
    pake_kdf_aad: str = "securecam-v1"
    pake_scrypt_n: int = 16384
    pake_scrypt_r: int = 8
    pake_scrypt_p: int = 1
    pake_session_ttl_seconds: int = 300

    # WireGuard settings
    wireguard_backend: str = "auto"  # "auto" | "real" | "sim"
    wireguard_base_port: int = 51820
    wireguard_config_dir: str = "/etc/wireguard"
    wireguard_interface_prefix: str = "wg-cam"

    # mDNS Discovery settings
    mdns_discovery_enabled: bool = False

    model_config = SettingsConfigDict(env_file=_env_files(), extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()