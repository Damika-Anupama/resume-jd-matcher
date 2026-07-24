"""Event-driven async analysis: Kafka producer, consumer worker, and job store.

This adds a real event-driven path on top of the synchronous matcher:

    POST /analyze/async  -> produce a job to a Kafka topic, return job_id
    (worker)             -> consume the topic, run the matcher, store the result
    GET  /analyze/status/{job_id} -> queued | done + result

The broker is Kafka-API compatible (Redpanda in docker-compose / tests). The job
store here is in-memory for the demo; a production system would use Redis or a
database so state survives restarts and is shared across workers.
"""
from __future__ import annotations

import json
import os
import threading
from typing import Optional

from app.llm_client import analyze
from app.store import make_store

ANALYSIS_TOPIC = os.environ.get("ANALYSIS_TOPIC", "analysis-requests")


def bootstrap_servers() -> str | None:
    """Kafka bootstrap servers, or None when the async path is not configured.

    Deliberately has NO localhost default: without explicit configuration the
    async endpoints must fail fast (503) instead of exposing a broken path that
    accepts jobs which nothing will ever process.
    """
    value = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "").strip()
    return value or None


def enabled() -> bool:
    """True when the event-driven async analysis path is configured."""
    return bootstrap_servers() is not None


class AsyncAnalysisDisabled(RuntimeError):
    """Raised when the Kafka-backed path is used without configuration."""


def _require_bootstrap() -> str:
    servers = bootstrap_servers()
    if servers is None:
        raise AsyncAnalysisDisabled(
            "Async analysis is not configured (set KAFKA_BOOTSTRAP_SERVERS)."
        )
    return servers

# Shared job store (in-memory by default, Redis when JOB_STORE=redis). Both the
# API and the consumer worker import this module, so when backed by Redis they
# observe the same job state across processes.
store = make_store()


def _make_producer():
    from confluent_kafka import Producer

    return Producer({"bootstrap.servers": _require_bootstrap()})


def publish_job(resume: str, jd: str) -> str:
    """Create a job record and publish it to the analysis topic. Returns job_id."""
    job = store.create()
    producer = _make_producer()
    payload = json.dumps(
        {"job_id": job.job_id, "resume": resume, "job_description": jd}
    )
    producer.produce(ANALYSIS_TOPIC, key=job.job_id, value=payload)
    producer.flush(10)
    return job.job_id


def process_message(value: bytes) -> None:
    """Handle one consumed message: run the matcher and store the result."""
    data = json.loads(value)
    job_id = data["job_id"]
    store.update(job_id, status="processing")
    try:
        result = analyze(data["resume"], data["job_description"])
        store.update(job_id, status="done", result=result)
    except Exception as exc:  # pragma: no cover - defensive
        store.update(job_id, status="error", error=str(exc))


def consume_forever(stop_event: Optional[threading.Event] = None) -> None:
    """Run a consumer loop. Used by the worker process and integration tests."""
    from confluent_kafka import Consumer

    consumer = Consumer(
        {
            "bootstrap.servers": _require_bootstrap(),
            "group.id": "analysis-workers",
            "auto.offset.reset": "earliest",
        }
    )
    consumer.subscribe([ANALYSIS_TOPIC])
    try:
        while stop_event is None or not stop_event.is_set():
            msg = consumer.poll(0.5)
            if msg is None:
                continue
            if msg.error():
                continue
            process_message(msg.value())
    finally:
        consumer.close()
