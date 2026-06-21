"""Tests for the pluggable job stores.

- InMemoryJobStore is tested directly (no dependencies).
- RedisJobStore is tested against a real Redis container, proving cross-store
  visibility; it is skipped automatically when Docker/redis are unavailable.
"""
from __future__ import annotations

import shutil
import socket
import subprocess
import time

import pytest

from app.store import InMemoryJobStore


def test_in_memory_create_get_update():
    store = InMemoryJobStore()
    job = store.create()
    created = store.get(job.job_id)
    assert created is not None
    assert created.status == "queued"

    store.update(job.job_id, status="done", result={"fit_score": 42})
    fetched = store.get(job.job_id)
    assert fetched is not None
    assert fetched.status == "done"
    assert fetched.result == {"fit_score": 42}


def test_in_memory_unknown_job_is_none():
    store = InMemoryJobStore()
    assert store.get("does-not-exist") is None
    store.update("does-not-exist", status="done")


REDIS_IMAGE = "redis:7-alpine"
CONTAINER_NAME = "rjm-redis-itest"
REDIS_HOST_PORT = 6390  # non-default to avoid clashing with a local redis
REDIS_URL = "redis://localhost:" + str(REDIS_HOST_PORT) + "/0"


def _docker_available() -> bool:
    if shutil.which("docker") is None:
        return False
    return subprocess.run(["docker", "info"], capture_output=True).returncode == 0


def _redis_client_available() -> bool:
    try:
        import redis  # noqa: F401

        return True
    except ImportError:
        return False


def _port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1)
        return sock.connect_ex((host, port)) == 0


@pytest.fixture(scope="module")
def redis_url():
    if not _docker_available() or not _redis_client_available():
        pytest.skip("Docker or redis client not available")

    subprocess.run(["docker", "rm", "-f", CONTAINER_NAME], capture_output=True)
    subprocess.run(
        [
            "docker", "run", "-d", "--name", CONTAINER_NAME,
            "-p", str(REDIS_HOST_PORT) + ":6379", REDIS_IMAGE,
        ],
        check=True,
        capture_output=True,
    )
    try:
        deadline = time.time() + 30
        while time.time() < deadline:
            if _port_open("localhost", REDIS_HOST_PORT):
                break
            time.sleep(0.5)
        else:
            pytest.skip("Redis did not become ready in time")
        time.sleep(1)
        yield REDIS_URL
    finally:
        subprocess.run(["docker", "rm", "-f", CONTAINER_NAME], capture_output=True)


@pytest.mark.integration
def test_redis_store_roundtrip_across_instances(redis_url):
    """Two separate RedisJobStore instances (simulating API + worker processes)
    must see each other's writes — the whole point of a shared store."""
    from app.store import RedisJobStore

    api_store = RedisJobStore(redis_url)
    worker_store = RedisJobStore(redis_url)

    job = api_store.create()
    seen = worker_store.get(job.job_id)
    assert seen is not None and seen.status == "queued"

    worker_store.update(
        job.job_id, status="done", result={"fit_score": 77, "matched_skills": ["react"]}
    )

    fetched = api_store.get(job.job_id)
    assert fetched is not None
    assert fetched.status == "done"
    assert fetched.result is not None
    assert fetched.result["fit_score"] == 77
    assert fetched.result["matched_skills"] == ["react"]
