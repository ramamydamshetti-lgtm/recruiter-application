"""
Central configuration from environment variables (.env supported via load_dotenv in main).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

MetaforgeMode = Literal["api", "sqlite"]


@dataclass(frozen=True)
class ClientIdentityConfig:
    """Configurable identity rules for client requirements (Rule 8)."""

    client_key: str
    display_name: str
    sender_domains: tuple[str, ...]
    table_req_id_headers: tuple[str, ...]
    table_status_headers: tuple[str, ...]
    status_words_hold: tuple[str, ...]
    status_words_open: tuple[str, ...]
    status_mapping: dict[str, str]
    use_req_id_identity: bool = True


DEFAULT_CLIENT_IDENTITY_CONFIGS: dict[str, ClientIdentityConfig] = {
    "accenture": ClientIdentityConfig(
        client_key="accenture",
        display_name="Accenture",
        sender_domains=("accenture.com", "iexcel.co.in"),
        table_req_id_headers=(
            "Request-ID",
            "Request ID",
            "Req ID",
            "Req-ID",
            "ReqID",
            "SO ID",
            "Demand ID",
        ),
        table_status_headers=("Priority", "Status", "Job Status", "Demand Status"),
        status_words_hold=("hold", "on hold", "on-hold", "paused", "deferred"),
        status_words_open=("p1", "p2", "p3", "open", "active", "urgent", "immediate"),
        status_mapping={
            "hold": "hold",
            "on hold": "hold",
            "on-hold": "hold",
            "p1": "open",
            "p2": "open",
            "p3": "open",
            "open": "open",
        },
        use_req_id_identity=True,
    ),
}


def get_client_identity_config(client_key_or_domain: str) -> ClientIdentityConfig | None:
    """Lookup client identity config by key, domain, or email address."""
    key = (client_key_or_domain or "").strip().lower()
    if "@" in key:
        key = key.rsplit("@", 1)[-1]
    if key in DEFAULT_CLIENT_IDENTITY_CONFIGS:
        return DEFAULT_CLIENT_IDENTITY_CONFIGS[key]
    for cfg in DEFAULT_CLIENT_IDENTITY_CONFIGS.values():
        if key == cfg.client_key or any(key == d or key.endswith("." + d) for d in cfg.sender_domains):
            return cfg
    return None


@dataclass(frozen=True)
class Settings:
    """Application settings loaded from the environment."""

    azure_tenant_id: str
    azure_client_id: str
    azure_client_secret: str
    mailbox_upn: str
    openai_api_key: str
    openai_model: str
    metaforge_api_url: str
    metaforge_requirements_endpoint: str
    metaforge_mode: MetaforgeMode
    metaforge_sqlite_path: str
    metaforge_id_db: str
    processed_db: str
    log_level: str
    openai_min_confidence: float
    internal_poc_default: str
    scheduler_poll_seconds: int
    scheduler_error_backoff_seconds: int
    scheduler_heartbeat_path: str
    file_listener_enabled: bool
    file_listener_inbox_dir: str
    file_listener_archive_dir: str

    @staticmethod
    def from_env() -> Settings:
        def _req(name: str) -> str:
            v = os.environ.get(name, "").strip()
            return v
        def _int(name: str, default: int) -> int:
            raw = _req(name)
            if not raw:
                return default
            try:
                return int(raw)
            except ValueError:
                return default
        def _bool(name: str, default: bool) -> bool:
            raw = _req(name).lower()
            if not raw:
                return default
            return raw in {"1", "true", "yes", "y", "on"}

        mode_raw = _req("METAFORGE_MODE").lower() or "api"
        if mode_raw not in ("api", "sqlite"):
            mode_raw = "api"

        min_conf_s = _req("OPENAI_MIN_CONFIDENCE") or "0"
        try:
            min_conf = float(min_conf_s)
        except ValueError:
            min_conf = 0.0

        return Settings(
            azure_tenant_id=_req("AZURE_TENANT_ID"),
            azure_client_id=_req("AZURE_CLIENT_ID"),
            azure_client_secret=_req("AZURE_CLIENT_SECRET"),
            mailbox_upn=_req("MAILBOX_UPN") or "recruitment.application@metaforgeit.com",
            openai_api_key=_req("OPENAI_API_KEY") or _req("GEMINI_API_KEY"),
            openai_model=_req("OPENAI_MODEL") or _req("LLM_MODEL") or "gpt-4o-mini",
            metaforge_api_url=_req("METAFORGE_API_URL").rstrip("/"),
            metaforge_requirements_endpoint=_req("METAFORGE_REQUIREMENTS_ENDPOINT")
            or "api/internal/requirements/ingest-email",
            metaforge_mode=mode_raw,  # type: ignore[arg-type]
            metaforge_sqlite_path=_req("METAFORGE_SQLITE_PATH") or "data/metaforge_requirements.db",
            metaforge_id_db=_req("METAFORGE_ID_DB") or "data/metaforge_sequences.db",
            processed_db=_req("PROCESSED_DB") or "data/processed_messages.db",
            log_level=_req("LOG_LEVEL") or "INFO",
            openai_min_confidence=min_conf,
            internal_poc_default=_req("INTERNAL_POC_DEFAULT") or "offshore demands",
            scheduler_poll_seconds=max(15, _int("SCHEDULER_POLL_SECONDS", 120)),
            scheduler_error_backoff_seconds=max(5, _int("SCHEDULER_ERROR_BACKOFF_SECONDS", 30)),
            scheduler_heartbeat_path=_req("SCHEDULER_HEARTBEAT_PATH")
            or "data/scheduler_heartbeat.json",
            file_listener_enabled=_bool("FILE_LISTENER_ENABLED", True),
            file_listener_inbox_dir=_req("FILE_LISTENER_INBOX_DIR") or "data/mail-drop/inbox",
            file_listener_archive_dir=_req("FILE_LISTENER_ARCHIVE_DIR") or "data/mail-drop/archive",
        )
