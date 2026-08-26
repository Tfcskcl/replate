import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=unauth, obj=auth
  const [outlets, setOutlets] = useState([]);
  const [selectedOutletId, setSelectedOutletId] = useState(
    localStorage.getItem("replate_outlet") || ""
  );

  const loadOutlets = useCallback(async () => {
    try {
      const { data } = await api.get("/outlets");
      setOutlets(data);
      if (data.length) {
        const stored = localStorage.getItem("replate_outlet");
        const valid = data.find((o) => o.id === stored);
        const chosen = valid ? stored : data[0].id;
        setSelectedOutletId(chosen);
        localStorage.setItem("replate_outlet", chosen);
      }
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("replate_token");
    if (!token) { setUser(false); return; }
    api.get("/auth/me")
      .then(({ data }) => { setUser(data); loadOutlets(); })
      .catch(() => { localStorage.removeItem("replate_token"); setUser(false); });
  }, [loadOutlets]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("replate_token", data.access_token);
    setUser(data.user);
    await loadOutlets();
    return data.user;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    localStorage.removeItem("replate_token");
    setUser(false);
  };

  const selectOutlet = (id) => {
    setSelectedOutletId(id);
    localStorage.setItem("replate_outlet", id);
  };

  const selectedOutlet = outlets.find((o) => o.id === selectedOutletId);

  return (
    <AuthContext.Provider value={{ user, outlets, selectedOutletId, selectedOutlet, selectOutlet, login, logout, loadOutlets }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
