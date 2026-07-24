"""Standalone consumer worker.

Run alongside the API to process queued analysis jobs:

    python -m app.worker

Reads KAFKA_BOOTSTRAP_SERVERS / ANALYSIS_TOPIC from the environment.
"""
import sys

from app.events import consume_forever, enabled

if __name__ == "__main__":
    if not enabled():
        sys.exit(
            "Async analysis is not configured: set KAFKA_BOOTSTRAP_SERVERS "
            "before starting the worker."
        )
    print("Analysis worker started; consuming jobs…")
    consume_forever()
