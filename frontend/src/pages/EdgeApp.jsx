import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { formatWeight, formatTime, timeAgo } from "@/lib/format";
import {
  Bluetooth, BluetoothConnected, Wifi, WifiOff, Server, Activity,
  CheckCircle2, Clock, RefreshCw, Send, Radio, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { connectScale } from "@/lib/scale";

const QUEUE_KEY = "replate_edge_queue";
const STABLE_THRESHOLD = 0.03; // kg range across window to be "stable"
const STABLE_WINDOW = 5;       // consecutive readings

const PRODUCTS_FALLBACK = [
  { id: "SKU_CHICKEN", name: "Chicken" }, { id: "SKU_PANEER", name: "Paneer" },
  { id: "SKU_CHEESE", name: "Cheese" }, { id: "SKU_MUTTON", name: "Mutton" },
  { id: "SKU_RICE", name: "Rice" }, { id: "SKU_OIL", name: "Oil" },
];

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "l_" + Date.now() + Math.random().toString(16).slice(2));
const loadQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; } };
const saveQueue = (q) => localStorage.setItem(QUEUE_KEY, JSON.stringify(q));

export default function EdgeApp() {
  const { outlets, selectedOutletId } = useAuth();
  const [tab, setTab] = useState("weigh");
  const [products, setProducts] = useState(PRODUCTS_FALLBACK);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("SCALE_001");

  const [btStatus, setBtStatus] = useState("disconnected"); // disconnected | connected | simulating
  const [online, setOnline] = useState(navigator.onLine);
  const [backendOk, setBackendOk] = useState(true);
  const [lastSync, setLastSync] = useState(null);

  const [weight, setWeight] = useState(0);
  const [stable, setStable] = useState(false);
  const [product, setProduct] = useState(null);
  const [movementType, setMovementType] = useState("STOCK_OUT");
  const [queue, setQueue] = useState(loadQueue());

  const readingsRef = useRef([]);
  const simRef = useRef(null);
  const btDeviceRef = useRef(null);

  const outlet = outlets.find((o) => o.id === selectedOutletId) || outlets[0];
  const scale = devices.find((d) => d.id === deviceId);

  // ---- data load ----
  useEffect(() => {
    if (!selectedOutletId) return;
    api.get(`/products?outlet_id=${selectedOutletId}&active=true`).then(({ data }) => data.length && setProducts(data));
    api.get(`/devices?outlet_id=${selectedOutletId}`).then(({ data }) => {
      setDevices(data);
      const s = data.find((d) => d.type === "SCALE" && d.status === "ACTIVE");
      if (s) setDeviceId(s.id);
    });
  }, [selectedOutletId]);

  // ---- connectivity ----
  useEffect(() => {
    const on = () => { setOnline(true); flushQueue(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- stability engine ----
  const pushReading = useCallback((val) => {
    setWeight(val);
    const arr = [...readingsRef.current, val].slice(-STABLE_WINDOW);
    readingsRef.current = arr;
    if (arr.length >= STABLE_WINDOW) {
      const range = Math.max(...arr) - Math.min(...arr);
      setStable(range <= STABLE_THRESHOLD && val > 0.05);
    } else {
      setStable(false);
    }
  }, []);

  // ---- simulate ----
  const startSimulate = () => {
    stopStreams();
    setBtStatus("simulating");
    let target = +(0.5 + Math.random() * 9).toFixed(3);
    let current = 0;
    readingsRef.current = [];
    simRef.current = setInterval(() => {
      if (current < target - 0.05) {
        current += Math.max(0.05, (target - current) * 0.25);
        current += (Math.random() - 0.5) * 0.06; // jitter while filling
      } else {
        current = target + (Math.random() - 0.5) * 0.02; // settle jitter
      }
      pushReading(+current.toFixed(3));
    }, 350);
  };

  const newSimTarget = () => { if (btStatus === "simulating") startSimulate(); };

  // ---- Web Bluetooth (real scale: WSS 0x181D + proprietary fallback) ----
  const connectBluetooth = async () => {
    try {
      const device = await connectScale({
        onWeight: (val) => pushReading(+val.toFixed(3)),
        onStatus: (s) => { if (s === "connected") { setBtStatus("connected"); toast.success("Scale connected"); } },
        onDisconnect: () => setBtStatus("disconnected"),
        onProtocol: (p) => toast.message(`Scale: ${p}`),
      });
      btDeviceRef.current = device;
    } catch (e) {
      if (e.message === "WEB_BLUETOOTH_UNSUPPORTED")
        toast.error("Web Bluetooth needs Android Chrome or desktop Chrome. Use Simulate.");
      else toast.error("Bluetooth connection cancelled / failed.");
    }
  };

  const stopStreams = () => {
    if (simRef.current) { clearInterval(simRef.current); simRef.current = null; }
  };
  const disconnect = () => {
    stopStreams();
    try { btDeviceRef.current?.gatt?.disconnect(); } catch { /* */ }
    setBtStatus("disconnected");
    setWeight(0); setStable(false); readingsRef.current = [];
  };
  useEffect(() => () => stopStreams(), []);

  // ---- send / queue / sync ----
  const syncEvent = async (ev) => {
    try {
      const { data } = await api.post("/scale-events", {
        local_event_id: ev.local_event_id, device_id: ev.device_id, outlet_id: ev.outlet_id,
        product_id: ev.product_id, weight: ev.weight, unit: ev.unit,
        movement_type: ev.movement_type, stability_status: "STABLE",
        source: "BLUETOOTH_SCALE", timestamp: ev.timestamp,
      });
      setBackendOk(true);
      setLastSync(new Date().toISOString());
      return { ...ev, sync_status: "SYNCED", server_event_id: data.weighing_event?.server_event_id, duplicate: data.duplicate };
    } catch (e) {
      setBackendOk(false);
      return { ...ev, sync_status: "PENDING" };
    }
  };

  const flushQueue = useCallback(async () => {
    const q = loadQueue();
    const pending = q.filter((e) => e.sync_status === "PENDING");
    if (!pending.length) return;
    let updated = [...q];
    for (const ev of pending) {
      const res = await syncEvent(ev);
      updated = updated.map((e) => (e.local_event_id === ev.local_event_id ? res : e));
    }
    saveQueue(updated); setQueue(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendToReplate = async () => {
    if (!product) { toast.error("Select a product first"); return; }
    if (!stable) { toast.error("Weight not stable yet"); return; }
    const ev = {
      local_event_id: uuid(), device_id: deviceId, outlet_id: outlet?.id || selectedOutletId,
      product_id: product.id, product_name: product.name, weight: +weight.toFixed(3), unit: "KG",
      movement_type: movementType, timestamp: new Date().toISOString(), sync_status: "PENDING",
    };
    const q = [ev, ...loadQueue()];
    saveQueue(q); setQueue(q);

    const res = await syncEvent(ev);
    const updated = q.map((e) => (e.local_event_id === ev.local_event_id ? res : e));
    saveQueue(updated); setQueue(updated);

    if (res.sync_status === "SYNCED") toast.success(`Sent · ${product.name} ${formatWeight(ev.weight)}`);
    else toast.warning("Saved offline — will sync when online");

    // reset session so continuous readings don't double-count
    setProduct(null); readingsRef.current = []; setStable(false);
    if (btStatus === "simulating") startSimulate();
  };

  // ---- UI helpers ----
  const StatusRow = ({ icon: Icon, label, value, ok }) => (
    <div className="flex items-center justify-between py-3 border-b border-zinc-800/80 last:border-0">
      <div className="flex items-center gap-3 text-sm text-zinc-300"><Icon size={16} className="text-zinc-500" />{label}</div>
      <span className={`text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${ok ? "text-green-400 bg-green-500/10 border-green-500/30" : "text-zinc-500 bg-zinc-800/60 border-zinc-700"}`}>{value}</span>
    </div>
  );

  return (
    <div className="grain min-h-screen bg-[#0B0B0C] text-white flex justify-center">
      <div className="w-full max-w-md min-h-screen border-x border-zinc-800/80 flex flex-col relative z-10">
        {/* header */}
        <div className="px-5 h-14 flex items-center justify-between border-b border-zinc-800/80 sticky top-0 bg-[#0B0B0C]/95 backdrop-blur z-20">
          <div className="flex items-center gap-3">
            <Link to="/app" className="text-zinc-500 hover:text-white" data-testid="edge-back"><ArrowLeft size={18} /></Link>
            <Logo size={22} />
          </div>
          <span className="micro-label text-[#EF5A28]">EDGE</span>
        </div>

        {/* tabs */}
        <div className="flex border-b border-zinc-800/80">
          {[["status", "Status"], ["weigh", "Weighing"], ["events", "Events"]].map(([k, l]) => (
            <button key={k} data-testid={`edge-tab-${k}`} onClick={() => setTab(k)}
              className={`flex-1 py-3 text-xs font-mono uppercase tracking-wider transition-colors ${tab === k ? "text-[#EF5A28] border-b-2 border-[#EF5A28]" : "text-zinc-500"}`}>{l}</button>
          ))}
        </div>

        <div className="flex-1 p-5">
          {/* STATUS */}
          {tab === "status" && (
            <div data-testid="edge-status-screen">
              <div className="micro-label mb-1">Outlet</div>
              <div className="font-display text-xl font-bold mb-4">{outlet?.name || "—"}</div>
              <div className="bg-[#121214] border border-zinc-800/80 rounded-lg px-4">
                <StatusRow icon={Radio} label="Scale" value={scale?.name?.slice(0, 14) || deviceId} ok={btStatus !== "disconnected"} />
                <StatusRow icon={btStatus !== "disconnected" ? BluetoothConnected : Bluetooth} label="Bluetooth"
                  value={btStatus === "connected" ? "Connected" : btStatus === "simulating" ? "Simulating" : "Off"} ok={btStatus !== "disconnected"} />
                <StatusRow icon={online ? Wifi : WifiOff} label="Internet" value={online ? "Online" : "Offline"} ok={online} />
                <StatusRow icon={Server} label="Backend" value={backendOk ? "Connected" : "Error"} ok={backendOk} />
                <StatusRow icon={Activity} label="Current Weight" value={`${weight.toFixed(3)} KG`} ok={weight > 0} />
                <StatusRow icon={Clock} label="Last Synced" value={lastSync ? timeAgo(lastSync) : "Never"} ok={!!lastSync} />
              </div>
              <div className="micro-label mt-6 mb-2">Queue</div>
              <div className="text-sm text-zinc-400">
                {queue.filter((e) => e.sync_status === "PENDING").length} pending · {queue.filter((e) => e.sync_status === "SYNCED").length} synced
              </div>
            </div>
          )}

          {/* WEIGHING */}
          {tab === "weigh" && (
            <div data-testid="edge-weigh-screen">
              {/* connection controls */}
              <div className="flex gap-2 mb-5">
                {btStatus === "disconnected" ? (
                  <>
                    <button data-testid="edge-connect-bt" onClick={connectBluetooth}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-sm font-medium py-2.5 rounded-md flex items-center justify-center gap-2 border border-zinc-700">
                      <Bluetooth size={16} /> Connect Scale
                    </button>
                    <button data-testid="edge-simulate" onClick={startSimulate}
                      className="flex-1 bg-zinc-900 border border-zinc-800 hover:border-[#EF5A28]/40 text-sm font-medium py-2.5 rounded-md flex items-center justify-center gap-2 text-zinc-300">
                      <Radio size={16} /> Simulate
                    </button>
                  </>
                ) : (
                  <button data-testid="edge-disconnect" onClick={disconnect}
                    className="flex-1 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium py-2.5 rounded-md">Disconnect</button>
                )}
              </div>

              {/* big weight readout */}
              <div className="bg-[#121214] border border-zinc-800/80 rounded-lg py-8 text-center mb-4">
                <div className="micro-label mb-3">Current Weight</div>
                <div data-testid="edge-weight-value" className="font-mono font-bold text-6xl tracking-tight">{weight.toFixed(3)}<span className="text-2xl text-zinc-500 ml-2">KG</span></div>
                <div className="mt-4">
                  <span data-testid="edge-stability" className={`inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest px-3 py-1 rounded-full border ${stable ? "text-green-400 bg-green-500/10 border-green-500/30" : "text-amber-400 bg-amber-500/10 border-amber-500/30"}`}>
                    <span className={`w-2 h-2 rounded-full ${stable ? "bg-green-400" : "bg-amber-400 pulse-dot"}`} />
                    {btStatus === "disconnected" ? "No Signal" : stable ? "Stable" : "Stabilising…"}
                  </span>
                </div>
                {btStatus === "simulating" && (
                  <button onClick={newSimTarget} className="mt-4 text-xs text-zinc-500 hover:text-white inline-flex items-center gap-1"><RefreshCw size={12} /> New sample</button>
                )}
              </div>

              {/* movement type */}
              <div className="flex gap-2 mb-4">
                {["STOCK_OUT", "STOCK_IN", "WASTE"].map((t) => (
                  <button key={t} data-testid={`edge-type-${t}`} onClick={() => setMovementType(t)}
                    className={`flex-1 py-2 rounded-md text-xs font-mono uppercase tracking-wider border transition-colors ${movementType === t ? "bg-[#EF5A28]/12 text-[#EF5A28] border-[#EF5A28]/40" : "bg-zinc-900 border-zinc-800 text-zinc-400"}`}>
                    {t.replace("_", " ")}
                  </button>
                ))}
              </div>

              {/* product selection */}
              <div className="micro-label mb-2">What are you weighing?</div>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {products.map((p) => (
                  <button key={p.id} data-testid={`edge-product-${p.id}`} onClick={() => setProduct(p)}
                    className={`py-3 rounded-md text-sm font-medium border transition-all active:scale-95 ${product?.id === p.id ? "bg-[#EF5A28] text-white border-[#EF5A28]" : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600"}`}>
                    {p.name}
                  </button>
                ))}
              </div>

              <button data-testid="edge-send" onClick={sendToReplate} disabled={!stable || !product}
                className="w-full bg-[#EF5A28] hover:bg-[#D94B1C] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-md flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
                <Send size={18} /> Send to Re-Plate
              </button>
            </div>
          )}

          {/* EVENTS */}
          {tab === "events" && (
            <div data-testid="edge-events-screen">
              <div className="flex items-center justify-between mb-4">
                <div className="micro-label">Recent Events</div>
                <button onClick={flushQueue} className="text-xs text-[#EF5A28] flex items-center gap-1"><RefreshCw size={12} /> Sync</button>
              </div>
              <div className="space-y-2">
                {queue.length === 0 && <div className="text-sm text-zinc-600 py-10 text-center">No events yet.</div>}
                {queue.map((e) => (
                  <div key={e.local_event_id} data-testid={`edge-event-${e.local_event_id}`}
                    className="bg-[#121214] border border-zinc-800/80 rounded-md p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{e.product_name}</div>
                      <div className="micro-label mt-0.5">{formatTime(e.timestamp)} · {e.movement_type.replace("_", " ")}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold text-sm">{formatWeight(e.weight)}</div>
                      <span className={`text-[10px] font-mono uppercase tracking-wider ${e.sync_status === "SYNCED" ? "text-green-400" : "text-amber-400"}`}>
                        {e.sync_status === "SYNCED" ? <span className="inline-flex items-center gap-1"><CheckCircle2 size={10} /> Synced</span> : <span className="inline-flex items-center gap-1"><Clock size={10} /> Pending</span>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
