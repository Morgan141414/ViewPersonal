from __future__ import annotations

import argparse
from pathlib import Path

import httpx


def read_bytes(path: str) -> bytes:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(str(p))
    return p.read_bytes()


def main() -> None:
    p = argparse.ArgumentParser(description="Demo: create employees, enroll faces, identify a query, and push AI observation to core")
    p.add_argument("--core", default="http://127.0.0.1:8000")
    p.add_argument("--ai", default="http://127.0.0.1:9000")
    p.add_argument("--email", default="admin@example.com")
    p.add_argument("--password", default="admin12345")
    p.add_argument("--emp1-name", default="Employee One")
    p.add_argument("--emp2-name", default="Employee Two")
    p.add_argument("--emp1-img", required=True, help="Path to image for employee 1")
    p.add_argument("--emp2-img", required=True, help="Path to image for employee 2")
    p.add_argument("--query-img", required=True, help="Path to query image")
    args = p.parse_args()

    with httpx.Client(timeout=30.0) as client:
        r = client.post(f"{args.core}/v1/auth/login", json={"email": args.email, "password": args.password})
        r.raise_for_status()
        token = r.json()["access_token"]
        headers = {"authorization": f"Bearer {token}"}

        # create employees
        def create_employee(full_name: str, external_id: str):
            rr = client.post(
                f"{args.core}/v1/employees/",
                headers=headers,
                json={"full_name": full_name, "external_id": external_id, "email": None},
            )
            if rr.status_code == 409:
                # already exists; fetch list and find
                lst = client.get(f"{args.core}/v1/employees/", headers=headers)
                lst.raise_for_status()
                for e in lst.json():
                    if e.get("external_id") == external_id:
                        return e
                raise RuntimeError("employee exists but not found")
            rr.raise_for_status()
            return rr.json()

        e1 = create_employee(args.emp1_name, "demo-emp-1")
        e2 = create_employee(args.emp2_name, "demo-emp-2")
        print(f"Employees: {e1['id']} / {e2['id']}")

        # enroll
        emp1_bytes = read_bytes(args.emp1_img)
        emp2_bytes = read_bytes(args.emp2_img)
        q_bytes = read_bytes(args.query_img)

        def enroll(emp_id: str, img: bytes):
            rr = client.post(
                f"{args.ai}/v1/face/enroll",
                files={"image": ("image.jpg", img, "image/jpeg")},
                data={"employee_id": emp_id},
            )
            rr.raise_for_status()
            return rr.json()

        print("Enrolling faces...")
        print("- emp1:", enroll(e1["id"], emp1_bytes))
        print("- emp2:", enroll(e2["id"], emp2_bytes))

        # identify
        print("Identifying query...")
        rr = client.post(
            f"{args.ai}/v1/face/identify",
            files={"image": ("query.jpg", q_bytes, "image/jpeg")},
            data={"top_k": "5"},
        )
        rr.raise_for_status()
        out = rr.json()
        print(out)

        # analyze (pushes observation into core)
        print("Analyze image (push -> core)...")
        rr = client.post(
            f"{args.ai}/v1/vision/analyze_image",
            files={"image": ("query.jpg", q_bytes, "image/jpeg")},
            data={"employee_id": e1["id"], "source_id": "demo-cam"},
        )
        rr.raise_for_status()
        print(rr.json())

        print("OK. Open dashboard -> AI tab and refresh.")


if __name__ == "__main__":
    main()
