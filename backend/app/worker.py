"""Standalone consumer worker.

Run alongside the API to process queued analysis jobs:

    python -m app.worker

Reads KAFKA_BOOTSTRAP_SERVERS / ANALYSIS_TOPIC from the environment.
"""
from app.events import consume_forever

if __name__ == "__main__":
    print("Analysis worker started; consuming jobs…")
    consume_forever()
