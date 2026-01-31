from __future__ import annotations

import argparse
import random
import time

import httpx


def main() -> None:
    p = argparse.ArgumentParser(description="Simulate edge device sending presence events")
    p.add_argument("--api", default="http://localhost:8000", help="API base URL")
    p.add_argument("--email", default="admin@example.com")
    p.add_argument("--password", default="admin12345")
    p.add_argument("--source", default="cam-1")
    p.add_argument("--tracks", type=int, default=3, help="Number of anonymous tracks")
    p.add_argument("--interval", type=float, default=2.0, help="Seconds between events")
    args = p.parse_args()

    tracks = [f"anon-{i:03d}" for i in range(1, args.tracks + 1)]

    with httpx.Client(timeout=10.0) as client:
        r = client.post(f"{args.api}/v1/auth/login", json={"email": args.email, "password": args.password})
        r.raise_for_status()
        token = r.json()["access_token"]
        headers = {"authorization": f"Bearer {token}"}

        print(f"Connected to {args.api} as {args.email}. Sending events...")
        while True:
            track = random.choice(tracks)
            payload = {
                "anonymous_track_id": track,
                "source_id": args.source,
                "event": "seen",
                "confidence": round(random.uniform(0.7, 0.99), 2),
                "payload": {"simulated": True},
            }
            rr = client.post(f"{args.api}/v1/presence/events", headers=headers, json=payload)
            rr.raise_for_status()
            print(f"sent: {track} ({payload['confidence']})")
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
