"""Pluggable job store backends for the async analysis pipeline.

Two interchangeable implementations behind a common interface:

- ``InMemoryJobStore`` — process-local, default, zero-dependency (fine for a
  single-process demo and unit tests).
- ``RedisJobStore`` — shared across processes, so the API and one or more
  consumer workers can run separately and still see the same job state. This is
  the production-shaped backend.

Select via ``JOB_STORE=redis`` + ``REDIS_URL`` (defaults to an in-memory store).
"""
from __future__ import annotations

import json
import os
import threading
import uuid
from dataclasses import dataclass
from typing import Optional, Protocol


@dataclass
class Job:
    job_id: str
    status: str = "queued"  # queued | processing | done | error
    result: Optional[dict] = None
    error: Optional[str] = None


class JobStore(Protocol):
    def create(self) -> Job: ...
    def get(self, job_id: str) -> Optional[Job]: ...
    def update(self, job_id: str, **fields) -> None: ...


class InMemoryJobStore:
    """Thread-safe, process-local store."""

    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def create(self) -> Job:
        job = Job(job_id=uuid.uuid4().hex)
        with self._lock:
            self._jobs[job.job_id] = job
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def update(self, job_id: str, **fields) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            for key, value in fields.items():
                setattr(job, key, value)


class RedisJobStore:
    """Redis-backed store shared across processes.

    Each job is a Redis hash keyed by ``job:<id>``; the ``result`` field is
    JSON-encoded. Updates are atomic per field. A TTL keeps finished jobs from
    accumulating forever.
    """

    def __init__(self, url: str, ttl_seconds: int = 86_400) -> None:
        import redis

        self._redis = redis.Redis.from_url(url, decode_responses=True)
        self._ttl = ttl_seconds

    def _key(self, job_id: str) -> str:
        return f"job:{job_id}"

    def create(self) -> Job:
        job = Job(job_id=uuid.uuid4().hex)
        self._redis.hset(self._key(job.job_id), mapping={"status": job.status})
        self._redis.expire(self._key(job.job_id), self._ttl)
        return job

    def get(self, job_id: str) -> Optional[Job]:
        data = self._redis.hgetall(self._key(job_id))
        if not data:
            return None
        result = json.loads(data["result"]) if data.get("result") else None
        return Job(
            job_id=job_id,
            status=data.get("status", "queued"),
            result=result,
            error=data.get("error") or None,
        )

    def update(self, job_id: str, **fields) -> None:
        key = self._key(job_id)
        if not self._redis.exists(key):
            return
        mapping = {}
        for name, value in fields.items():
            if name == "result":
                mapping["result"] = json.dumps(value) if value is not None else ""
            else:
                mapping[name] = "" if value is None else str(value)
        if mapping:
            self._redis.hset(key, mapping=mapping)
            self._redis.expire(key, self._ttl)


def make_store() -> JobStore:
    """Build the configured store backend."""
    backend = os.environ.get("JOB_STORE", "memory").lower()
    if backend == "redis":
        url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        return RedisJobStore(url)
    return InMemoryJobStore()
