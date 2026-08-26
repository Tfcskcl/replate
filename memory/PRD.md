# RE-PLATE — Product Requirements (V0.1 Prototype)

## Original Problem Statement
Build the first functional prototype of RE-PLATE (existing brand, ref https://re-plate.in/), a hospitality operations & inventory-intelligence platform. Prove the physical-world data flow:
Bluetooth weighing scale → edge app → Re-Plate API → MongoDB → web dashboard, where every stable weight becomes an immutable, auditable inventory movement with ₹ financial impact. Architecture must be extensible for future Camera/Jarvis and POS events without rebuild.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor). All routes under `/api`. JWT (Bearer) auth.
- **Web dashboard**: React (dark Re-Plate brand: #0B0B0C bg, #EF5A28 accent, mono micro-labels).
- **Edge app**: React mobile-first controller at `/edge`, Web Bluetooth + Simulate fallback, client-side stability engine + offline queue (localStorage), idempotent sync.
- **Event engine**: raw readings → stability → weighing_event → inventory_movement (immutable ledger) → product stock update. `camera_events` & `sales_events` collections future-ready.

## User Personas
- Owner/Admin (full access), Manager (outlet+inventory+reports), Store Manager (inventory+movements), Operator (weighing via edge app).

## Core Requirements (static)
- Immutable movement ledger; corrections via adjustment events; never silently overwrite stock.
- No double-deduction from continuous readings (stability engine + dedup by local_event_id).
- Multi-outlet; INR currency; weights to 3 decimals.

## Implemented (2026-08-26)
- JWT auth (login/me/logout/refresh), role-seeded users, brute-force-free simple prototype.
- Modules: Dashboard, Inventory, Movements (filterable), Products/SKU CRUD, Weighing Events, Devices, Outlets, Users, Organisation.
- Endpoints: /auth/*, /organisation, /outlets, /users, /products, /inventory, /inventory/movements, /devices (+heartbeat), /scale-events (idempotent), /camera-events, /sales-events, /dashboard/summary.
- Edge app: 3 tabs (Status / Weighing / Events), stability engine (0.03kg over 5 readings), simulate mode, Web Bluetooth generic parser, offline queue with PENDING→SYNCED, dedup on server.
- Full demo seed: org, 2 outlets, 6 products, 3 devices (scale/edge/future-camera), 4 users, today's sample movements + weighing events.
- Verified end-to-end by testing agent (16/16 backend, all frontend flows, idempotency proven).

## Backlog (prioritized)
- **P1**: Camera/Jarvis event correlation with weighing events; recipe/BOM + POS-driven expected consumption → variance & ₹ leakage.
- **P1**: Real BLE scale protocol mapping (device-specific characteristic parsing) once manufacturer spec is available.
- **P2**: Atomic `$inc` stock updates + optimistic locking for concurrent scale events.
- **P2**: Adjustment/correction UI, per-zone inventory, transfers between outlets.
- **P2**: Reports/exports, low-stock WhatsApp alerts, weekly trend charts.

## Manufacturer info needed (weighing scale)
- BLE GATT service & characteristic UUIDs that stream weight; data frame format (ASCII vs binary, byte order, scaling factor); stable-weight flag if the device emits one; units field.

## Next Tasks
- Confirm scale BLE spec → finalize parser; add camera-event correlation stub UI.
