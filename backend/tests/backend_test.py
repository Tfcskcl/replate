"""RE-PLATE backend API tests.
Covers: auth, dashboard, products/inventory/movements CRUD, scale-events flow + idempotency,
camera/sales events, outlet & user creation.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://replate-proto.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER_EMAIL = "amit@chef-hire.in"
OWNER_PASS = "replate123"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASS}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and "user" in data
    assert data["user"]["email"] == OWNER_EMAIL
    return data["access_token"]


@pytest.fixture(scope="session")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ---- Auth ----
class TestAuth:
    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": "wrongpass"}, timeout=30)
        assert r.status_code == 401

    def test_me(self, client):
        r = client.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == OWNER_EMAIL

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401


# ---- Dashboard ----
class TestDashboard:
    def test_summary(self, client):
        r = client.get(f"{API}/dashboard/summary?outlet_id=OUTLET_001")
        assert r.status_code == 200
        d = r.json()
        for k in ["total_inventory_value", "today_stock_in", "today_stock_out", "today_waste",
                  "low_stock", "recent_movements", "recent_weighings", "devices"]:
            assert k in d, f"missing {k}"


# ---- Products / Inventory ----
class TestProducts:
    def test_list_products(self, client):
        r = client.get(f"{API}/products?outlet_id=OUTLET_001")
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert "SKU_CHICKEN" in ids

    def test_create_and_update_product(self, client):
        r = client.post(f"{API}/products", json={
            "name": "TEST_Tomato", "category": "Vegetable", "unit": "KG",
            "opening_stock": 5.0, "minimum_stock": 1, "cost_per_unit": 40,
            "outlet_id": "OUTLET_001",
        })
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        assert r.json()["current_stock"] == 5.0

        r2 = client.put(f"{API}/products/{pid}", json={"cost_per_unit": 45})
        assert r2.status_code == 200
        assert r2.json()["cost_per_unit"] == 45

    def test_inventory(self, client):
        r = client.get(f"{API}/inventory?outlet_id=OUTLET_001")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0
        for row in rows:
            assert "stock_value" in row and "today_movement" in row and "low_stock" in row


# ---- Scale events flow + idempotency ----
class TestScaleEvents:
    def _get_stock(self, client, pid):
        r = client.get(f"{API}/products?outlet_id=OUTLET_001")
        for p in r.json():
            if p["id"] == pid:
                return float(p["current_stock"])
        return None

    def test_scale_event_creates_ledger_and_deducts_stock(self, client):
        pid = "SKU_CHICKEN"
        cost = 280
        weight = 2.5
        before = self._get_stock(client, pid)
        local_id = f"TEST_{uuid.uuid4().hex}"
        r = client.post(f"{API}/scale-events", json={
            "local_event_id": local_id, "device_id": "SCALE_001", "outlet_id": "OUTLET_001",
            "product_id": pid, "weight": weight, "unit": "KG", "movement_type": "STOCK_OUT",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["duplicate"] is False
        mv = d["movement"]
        assert mv["financial_impact"] == round(weight * cost, 2)
        assert mv["movement_type"] == "STOCK_OUT"

        after = self._get_stock(client, pid)
        assert round(before - after, 3) == weight, f"stock diff wrong: {before}->{after}"

        # weighing event present
        we = client.get(f"{API}/scale-events?outlet_id=OUTLET_001").json()
        assert any(w.get("local_event_id") == local_id for w in we)

        # movement listable
        mvs = client.get(f"{API}/inventory/movements?outlet_id=OUTLET_001&product_id={pid}").json()
        assert any(m.get("id") == mv["id"] for m in mvs)

    def test_scale_event_idempotency(self, client):
        pid = "SKU_PANEER"
        local_id = f"TEST_DUP_{uuid.uuid4().hex}"
        payload = {
            "local_event_id": local_id, "device_id": "SCALE_001", "outlet_id": "OUTLET_001",
            "product_id": pid, "weight": 1.0, "unit": "KG", "movement_type": "STOCK_OUT",
        }
        before = self._get_stock(client, pid)
        r1 = client.post(f"{API}/scale-events", json=payload)
        assert r1.status_code == 200
        assert r1.json()["duplicate"] is False
        mid_stock = self._get_stock(client, pid)
        assert round(before - mid_stock, 3) == 1.0

        r2 = client.post(f"{API}/scale-events", json=payload)
        assert r2.status_code == 200
        assert r2.json().get("duplicate") is True
        after = self._get_stock(client, pid)
        assert after == mid_stock, "duplicate should not deduct again"


# ---- Movement filtering + manual create ----
class TestMovements:
    def test_filter_movements(self, client):
        r = client.get(f"{API}/inventory/movements?outlet_id=OUTLET_001&movement_type=STOCK_OUT")
        assert r.status_code == 200
        for m in r.json():
            assert m["movement_type"] == "STOCK_OUT"

    def test_manual_stock_in(self, client):
        pid = "SKU_RICE"
        before_r = client.get(f"{API}/products?outlet_id=OUTLET_001").json()
        before = next(p["current_stock"] for p in before_r if p["id"] == pid)
        r = client.post(f"{API}/inventory/movements", json={
            "outlet_id": "OUTLET_001", "product_id": pid, "quantity": 5.0,
            "movement_type": "STOCK_IN", "source": "MANUAL", "note": "TEST_manual_in",
        })
        assert r.status_code == 200
        after_r = client.get(f"{API}/products?outlet_id=OUTLET_001").json()
        after = next(p["current_stock"] for p in after_r if p["id"] == pid)
        assert round(after - before, 3) == 5.0


# ---- Users / Outlets / Devices CRUD ----
class TestCRUD:
    def test_create_user_and_duplicate_rejected(self, client):
        email = f"test_{uuid.uuid4().hex[:6]}@example.com"
        r = client.post(f"{API}/users", json={
            "name": "TEST User", "email": email, "password": "pw12345", "role": "OPERATOR",
            "outlet_id": "OUTLET_001",
        })
        assert r.status_code == 200
        r2 = client.post(f"{API}/users", json={
            "name": "TEST User", "email": email, "password": "pw12345", "role": "OPERATOR",
        })
        assert r2.status_code == 400

    def test_create_outlet(self, client):
        r = client.post(f"{API}/outlets", json={"name": f"TEST Outlet {uuid.uuid4().hex[:4]}"})
        assert r.status_code == 200
        assert r.json()["name"].startswith("TEST Outlet")

    def test_create_device(self, client):
        code = f"TESTDEV_{uuid.uuid4().hex[:6].upper()}"
        r = client.post(f"{API}/devices", json={
            "name": "TEST Scale", "type": "SCALE", "outlet_id": "OUTLET_001",
            "code": code, "status": "ACTIVE",
        })
        assert r.status_code == 200
        assert r.json()["id"] == code


# ---- Future-ready events ----
class TestFutureEvents:
    def test_camera_event(self, client):
        r = client.post(f"{API}/camera-events", json={
            "camera_id": "CAM_001", "outlet_id": "OUTLET_001",
            "event_type": "PRODUCT_DETECTED", "product_id": "SKU_CHICKEN", "confidence": 0.9,
        })
        assert r.status_code == 200
        r2 = client.get(f"{API}/camera-events")
        assert r2.status_code == 200
        assert isinstance(r2.json(), list)

    def test_sales_event(self, client):
        r = client.post(f"{API}/sales-events", json={
            "outlet_id": "OUTLET_001", "product_id": "SKU_RICE", "quantity": 1.0,
            "source": "POS", "external_reference": "TEST_INV_1",
        })
        assert r.status_code == 200
        r2 = client.get(f"{API}/sales-events")
        assert r2.status_code == 200
