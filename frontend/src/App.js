import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import Movements from "@/pages/Movements";
import Products from "@/pages/Products";
import WeighingEvents from "@/pages/WeighingEvents";
import Devices from "@/pages/Devices";
import Outlets from "@/pages/Outlets";
import Users from "@/pages/Users";
import Organisation from "@/pages/Organisation";
import EdgeApp from "@/pages/EdgeApp";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) return <div className="min-h-screen flex items-center justify-center bg-[#0B0B0C] text-zinc-500 font-mono text-sm">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/edge" element={<Protected><EdgeApp /></Protected>} />
          <Route path="/" element={<Protected><AppLayout /></Protected>}>
            <Route index element={<Dashboard />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="movements" element={<Movements />} />
            <Route path="products" element={<Products />} />
            <Route path="weighing-events" element={<WeighingEvents />} />
            <Route path="devices" element={<Devices />} />
            <Route path="outlets" element={<Outlets />} />
            <Route path="users" element={<Users />} />
            <Route path="organisation" element={<Organisation />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster theme="dark" position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;
