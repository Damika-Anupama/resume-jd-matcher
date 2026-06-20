"""Real produce→consume integration test against a live Kafka-API broker.

Spins up Redpanda in Docker, publishes a job via the producer path, runs the
consumer once, and asserts the result lands in the job store. This is a genuine
end-to-end event-driven test — not a mock.

It is skipped automatically when Docker or the Kafka client is unavailable so
the rest of the suite still runs in minimal environments.
"""
from __future__ import annotations

import shutil
import socket
import subprocess
import threading
import time

import pytest

pytestmark = pytest.mark.integration

REDPANDA_IMAGE = "redpandadata/redpanda:v24.2.7"
CONTAINER_NAME = "rjm-redpanda-itest"
BOOTSTRAP = "localhost:19092"


def _docker_available() -> bool:
    if shutil.which("docker") is None:
        return False
    return subprocess.run(
        ["docker", "info"], capture_output=True
    ).returncode == 0


def _kafka_client_available() -> bool:
    try:
        import confluent_kafka  # noqa: F401

        return True
    except ImportError:
        return False


def _port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1)
        return sock.connect_ex((host, port)) == 0


@pytest.fixture(scope="module")
def redpanda():
    if not _docker_available() or not _kafka_client_available():
        pytest.skip("Docker or confluent-kafka not available")

    subprocess.run(["docker", "rm", "-f", CONTAINER_NAME], capture_output=True)
    subprocess.run(
        [
            "docker", "run", "-d", "--name", CONTAINER_NAME,
            "-p", "19092:19092", REDPANDA_IMAGE,
            "redpanda", "start", "--smp=1", "--memory=1G", "--overprovisioned",
            "--node-id=0",
            "--kafka-addr=PLAINTEXT://0.0.0.0:19092",
            "--advertise-kafka-addr=PLAINTEXT://localhost:19092",
        ],
        check=True,
        capture_output=True,
    )
    try:
        # Wait for the Kafka port to accept connections.
        deadline = time.time() + 60
        while time.time() < deadline:
            if _port_open("localhost", 19092):
                break
            time.sleep(1)
        else:
            pytest.skip("Redpanda did not become ready in time")
        time.sleep(3)  # small grace period for the broker to settle
        yield BOOTSTRAP
    finally:
        subprocess.run(["docker", "rm", "-f", CONTAINER_NAME], capture_output=True)


def test_produce_consume_roundtrip(redpanda, monkeypatch):
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", redpanda)
    monkeypatch.setenv("ANALYSIS_TOPIC", "analysis-requests-itest")

    # Reimport so the module picks up the env-configured bootstrap/topic.
    import importlib
    from app import events as events_module
    events = importlib.reload(events_module)

    # Publish a real job.
    job_id = events.publish_job(
        "Built React and Next.js apps in TypeScript with FastAPI.",
        "Need React, Next.js, TypeScript and Kubernetes.",
    )
    assert events.store.get(job_id).status == "queued"

    # Run the consumer in a thread until the job is processed (or timeout).
    stop = threading.Event()
    worker = threading.Thread(target=events.consume_forever, args=(stop,), daemon=True)
    worker.start()

    deadline = time.time() + 30
    job = events.store.get(job_id)
    while time.time() < deadline and job.status != "done":
        time.sleep(0.5)
        job = events.store.get(job_id)

    stop.set()
    worker.join(timeout=5)

    assert job.status == "done", f"job did not complete: {job.status} {job.error}"
    assert job.result is not None
    assert "react" in job.result["matched_skills"]
    assert "kubernetes" in job.result["missing_skills"]
