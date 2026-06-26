"""Structured JSON logging configuration for the API.

The app keeps logging dependency-light and explicit: every request gets a
request_id, every emitted line is JSON, and log records avoid request/resume/JD
body contents so portfolio observability evidence does not leak user data.
"""
from __future__ import annotations

import logging
import sys

import structlog


def configure_logging(level: str = "INFO") -> None:
    """Configure stdlib + structlog for JSON logs.

    Safe to call more than once; tests import the FastAPI app repeatedly and
    should not accumulate duplicate handlers.
    """
    timestamper = structlog.processors.TimeStamper(fmt="iso", utc=True)

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, level.upper(), logging.INFO),
        force=True,
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            timestamper,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper(), logging.INFO)
        ),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=False,
    )
