// Web Bluetooth scale connector.
// Supports the Bluetooth SIG Weight Scale Service (0x181D / 0x2A9D) used by many
// commercial scales, plus common proprietary packets (0xFFF0 notify streams such as
// Etekcity 17-byte / Xiaomi 13-byte where weight sits at bytes 11-12, little-endian),
// with an ASCII / generic fallback. Weight is always normalised to KG.

export const WSS_SERVICE = 0x181d;
export const WEIGHT_MEASUREMENT = 0x2a9d;
export const WEIGHT_FEATURE = 0x2a9e;
export const PROP_SERVICE = 0xfff0;

const LB_TO_KG = 0.45359237;

// Bluetooth SIG standard: [flags:1][weight:uint16 LE][...optional]
export function parseWSS(dv) {
  if (dv.byteLength < 3) return null;
  const flags = dv.getUint8(0);
  const raw = dv.getUint16(1, true);
  if (raw === 0xffff) return null; // sentinel = failed measurement
  const imperial = (flags & 0x01) === 1;
  const kg = imperial ? raw * 0.01 * LB_TO_KG : raw * 0.005;
  return { weight: kg, unit: "KG" };
}

// Proprietary notify packets — weight commonly at bytes 11-12 LE for >=13 byte frames.
export function parseProprietary(dv) {
  const n = dv.byteLength;
  if (n >= 13) {
    const raw = dv.getUint16(11, true);
    let w = raw / 100;
    if (w > 300) w = raw / 1000; // some scales send grams
    const stable = n >= 17 ? dv.getUint8(16) !== 0 : undefined;
    if (w > 0 && w < 1000) return { weight: w, stable, unit: "KG" };
  }
  // fallback: scan 16-bit pairs for a plausible kg value
  for (let i = 0; i + 1 < n; i++) {
    const w = dv.getUint16(i, true) / 100;
    if (w > 0.02 && w < 200) return { weight: w, unit: "KG" };
  }
  return null;
}

export function parseAscii(dv) {
  try {
    const text = new TextDecoder().decode(dv);
    const m = text.match(/-?\d+(\.\d+)?/);
    if (m) {
      let w = parseFloat(m[0]);
      if (/\bg\b/i.test(text) && !/kg/i.test(text)) w = w / 1000;
      if (/lb/i.test(text)) w = w * LB_TO_KG;
      return { weight: w, unit: "KG" };
    }
  } catch { /* not text */ }
  return null;
}

// Connect and stream weight readings. Returns the BluetoothDevice.
export async function connectScale({ onWeight, onStatus, onDisconnect, onProtocol }) {
  if (!navigator.bluetooth) throw new Error("WEB_BLUETOOTH_UNSUPPORTED");

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [
      WSS_SERVICE, WEIGHT_FEATURE, PROP_SERVICE, 0x180f,
      "weight_scale", "battery_service",
      "0000fff0-0000-1000-8000-00805f9b34fb",
    ],
  });

  device.addEventListener("gattserverdisconnected", () => onDisconnect && onDisconnect());
  const server = await device.gatt.connect();
  onStatus && onStatus("connected");

  const emit = (p) => {
    if (p && p.weight != null && !isNaN(p.weight) && p.weight >= 0) onWeight && onWeight(p.weight);
  };

  let bound = false;
  const services = await server.getPrimaryServices();

  for (const svc of services) {
    const uuid = svc.uuid;
    try {
      if (uuid.includes("181d")) {
        const ch = await svc.getCharacteristic(WEIGHT_MEASUREMENT);
        await ch.startNotifications();
        ch.addEventListener("characteristicvaluechanged", (e) => emit(parseWSS(e.target.value)));
        onProtocol && onProtocol("Bluetooth SIG Weight Scale (0x2A9D)");
        bound = true;
      } else if (uuid.includes("fff0")) {
        const chars = await svc.getCharacteristics();
        for (const ch of chars) {
          if (ch.properties.notify || ch.properties.indicate) {
            await ch.startNotifications();
            ch.addEventListener("characteristicvaluechanged",
              (e) => emit(parseProprietary(e.target.value) || parseAscii(e.target.value)));
            bound = true;
          }
          if (ch.properties.write || ch.properties.writeWithoutResponse) {
            try { await ch.writeValue(Uint8Array.of(0x01)); } catch { /* start-stream cmd optional */ }
          }
        }
        onProtocol && onProtocol("Proprietary scale (0xFFF0)");
      }
    } catch { /* skip service */ }
  }

  if (!bound) {
    for (const svc of services) {
      try {
        const chars = await svc.getCharacteristics();
        for (const ch of chars) {
          if (ch.properties.notify) {
            await ch.startNotifications();
            ch.addEventListener("characteristicvaluechanged",
              (e) => emit(parseAscii(e.target.value) || parseProprietary(e.target.value)));
            bound = true;
          }
        }
      } catch { /* skip */ }
    }
    onProtocol && onProtocol(bound ? "Generic notify stream" : "No weight stream found");
  }

  return device;
}
