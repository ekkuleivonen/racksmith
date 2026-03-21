"""Structured JSON logging configuration."""

import logging
import re
import sys
from collections.abc import Mapping, MutableMapping
from typing import Any

import structlog

from racksmith_shared import settings_base

_SENSITIVE_RE = re.compile(
    r"""(become_password|ansible_become_pass)=('[^']*'|"[^"]*")""",
    re.IGNORECASE,
)


def _redact_secrets(
    _logger: Any,
    _method_name: str,
    event_dict: MutableMapping[str, Any],
) -> Mapping[str, Any]:
    event = event_dict.get("event", "")
    if isinstance(event, str):
        event_dict["event"] = _SENSITIVE_RE.sub(r"\1='***'", event)
    return event_dict


_shared_processors: list[structlog.types.Processor] = [
    structlog.stdlib.add_log_level,
    structlog.stdlib.add_logger_name,
    structlog.processors.TimeStamper(fmt="iso"),
    _redact_secrets,
    structlog.processors.StackInfoRenderer(),
    structlog.processors.format_exc_info,
    structlog.processors.UnicodeDecoder(),
]


def configure_logging(
    log_level: str = "INFO",
    silence: list[str] | None = None,
) -> None:
    level = getattr(logging, log_level.upper(), logging.INFO)

    if silence is None:
        silence = settings_base.SILENCE_LOGGERS

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=_shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(),
        ],
    )

    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    root.addHandler(handler)

    for name in silence:
        logger = logging.getLogger(name)
        logger.setLevel(logging.ERROR)
        logger.propagate = False

    structlog.configure(
        processors=_shared_processors + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
