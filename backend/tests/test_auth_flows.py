"""RE-PLATE V0.1 — self-service Register + Approval + Forgot/Reset password flow tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

OWNER = ("amit@chef-hire.in", "replate123")
OPERATOR = ("operator@re-plate.in", "replate123")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    return r


def _token(email, password):
    r = _login(email, password)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def owner_client():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {_token(*OWNER)}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def operator_client():
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {_token(*OPERATOR)}", "Content-Type": "application/json"})
    return s


# ---------- Register + admin approval ----------
class TestRegisterApproval:
    def test_register_creates_pending_and_pending_cannot_login(self, owner_client):
        email = f"qa_pending_{uuid.uuid4().hex[:8]}@test.in"
        password = "pw12345"
        r = requests.post(f"{API}/auth/register",
                          json={"name": "QA Pending", "email": email, "password": password}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "PENDING"
        assert "pending" in body.get("message", "").lower()

        # Duplicate registration
        r2 = requests.post(f"{API}/auth/register",
                           json={"name": "QA Pending", "email": email, "password": password}, timeout=30)
        assert r2.status_code == 400

        # Pending user cannot login -> 403
        r3 = _login(email, password)
        assert r3.status_code == 403, r3.text
        assert "pending" in r3.text.lower() or "approval" in r3.text.lower()

        # Owner sees user with PENDING status
        users = owner_client.get(f"{API}/users").json()
        pending = next((u for u in users if u["email"] == email), None)
        assert pending is not None, "registered user not returned by /api/users"
        assert pending["status"] == "PENDING"
        assert pending.get("approved") in (False, None)
        assert pending["role"] == "OPERATOR"

        # store for later tests via pytest namespace
        pytest.pending_user_id = pending["id"]
        pytest.pending_email = email
        pytest.pending_password = password

    def test_non_admin_cannot_approve(self, operator_client):
        uid = getattr(pytest, "pending_user_id", None)
        assert uid, "prerequisite test did not run"
        r = operator_client.post(f"{API}/users/{uid}/approve")
        assert r.status_code == 403

    def test_owner_approves_and_user_can_login(self, owner_client):
        uid = pytest.pending_user_id
        r = owner_client.post(f"{API}/users/{uid}/approve")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "ACTIVE"
        assert data["approved"] is True

        r2 = _login(pytest.pending_email, pytest.pending_password)
        assert r2.status_code == 200, r2.text
        assert r2.json()["user"]["email"] == pytest.pending_email

    def test_existing_seeded_users_still_login(self):
        for email, pw in [OWNER, ("manager@re-plate.in", "replate123"), OPERATOR]:
            r = _login(email, pw)
            assert r.status_code == 200, f"seeded {email} login failed: {r.text}"


# ---------- Forgot / Reset password ----------
class TestForgotReset:
    def test_full_reset_flow(self):
        # Register + approve a fresh user so we don't disturb seeded credentials
        email = f"qa_reset_{uuid.uuid4().hex[:8]}@test.in"
        original_pw = "origPW123"
        new_pw = "newPW98765"

        reg = requests.post(f"{API}/auth/register",
                            json={"name": "QA Reset", "email": email, "password": original_pw}, timeout=30)
        assert reg.status_code == 200

        owner_tok = _token(*OWNER)
        os_headers = {"Authorization": f"Bearer {owner_tok}", "Content-Type": "application/json"}
        users = requests.get(f"{API}/users", headers=os_headers, timeout=30).json()
        uid = next(u["id"] for u in users if u["email"] == email)
        r = requests.post(f"{API}/users/{uid}/approve", headers=os_headers, timeout=30)
        assert r.status_code == 200

        # Confirm original login works
        assert _login(email, original_pw).status_code == 200

        # forgot-password returns reset_link + reset_token (email is mocked)
        r = requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "message" in body
        assert "reset_token" in body and body["reset_token"]
        assert "reset_link" in body and "token=" in body["reset_link"]
        token = body["reset_token"]

        # reset-password with the token
        r = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": new_pw}, timeout=30)
        assert r.status_code == 200

        # Old password fails
        assert _login(email, original_pw).status_code == 401
        # New password succeeds
        assert _login(email, new_pw).status_code == 200

        # Reusing same token fails (400)
        r = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": "another123"}, timeout=30)
        assert r.status_code == 400

    def test_invalid_reset_token(self):
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": "nonexistent_token_xyz", "password": "whatever123"}, timeout=30)
        assert r.status_code == 400

    def test_forgot_password_unknown_email_generic_response(self):
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": f"nope_{uuid.uuid4().hex}@nowhere.in"}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        # Should NOT leak reset_link/token for unknown emails
        assert "reset_link" not in body
        assert "reset_token" not in body
