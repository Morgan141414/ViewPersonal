from __future__ import annotations

from starlette.testclient import TestClient

from app.main import app


def main() -> None:
    with TestClient(app) as client:
        r = client.get("/v1/health")
        assert r.status_code == 200, r.text

        r = client.post(
            "/v1/auth/login",
            json={"email": "admin@example.com", "password": "admin12345"},
        )
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]

        headers = {"authorization": f"Bearer {token}"}

        r = client.post(
            "/v1/presence/events",
            headers=headers,
            json={
                "anonymous_track_id": "anon-001",
                "source_id": "cam-1",
                "event": "seen",
                "confidence": 0.9,
                "payload": {"simulated": True},
            },
        )
        assert r.status_code == 201, r.text

        r = client.get("/v1/presence/current", headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    print("smoke_test: OK")


if __name__ == "__main__":
    main()
