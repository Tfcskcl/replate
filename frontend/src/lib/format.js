export function formatINR(value) {
  const n = Number(value || 0);
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function formatINRPrecise(value) {
  const n = Number(value || 0);
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatWeight(value, unit = "KG") {
  return `${Number(value || 0).toFixed(3)} ${unit}`;
}

export function formatTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

export function timeAgo(iso) {
  if (!iso) return "never";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export const MOVEMENT_STYLES = {
  STOCK_IN: { label: "STOCK IN", cls: "text-green-400 bg-green-500/10 border-green-500/30" },
  STOCK_OUT: { label: "STOCK OUT", cls: "text-[#EF5A28] bg-[#EF5A28]/10 border-[#EF5A28]/30" },
  WASTE: { label: "WASTE", cls: "text-red-400 bg-red-500/10 border-red-500/30" },
  ADJUSTMENT: { label: "ADJUSTMENT", cls: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  TRANSFER_IN: { label: "TRANSFER IN", cls: "text-green-300 bg-green-500/10 border-green-500/30" },
  TRANSFER_OUT: { label: "TRANSFER OUT", cls: "text-amber-300 bg-amber-500/10 border-amber-500/30" },
};
