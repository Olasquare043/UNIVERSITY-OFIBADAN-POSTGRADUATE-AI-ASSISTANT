import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Cpu, LayoutDashboard, Library, LogOut, MessageSquareWarning, Moon, Search, Settings as SettingsIcon, Sun, Users } from "lucide-react";
import { api } from "./adminApi";
import { useTheme } from "../hooks/useTheme";
import Crest from "../components/Crest";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Knowledge from "./pages/Knowledge";
import Playground from "./pages/Playground";
import Insights from "./pages/Insights";
import Models from "./pages/Models";
import Settings from "./pages/Settings";
import People from "./pages/People";
import "./admin.css";

const NAV = [
  { to: "/admin", end: true, label: "Overview", short: "Home", icon: LayoutDashboard },
  { to: "/admin/knowledge", label: "Documents", short: "Files", icon: Library },
  { to: "/admin/playground", label: "Test search", short: "Search", icon: Search },
  { to: "/admin/insights", label: "Insights", icon: MessageSquareWarning },
  { to: "/admin/models", label: "Models", icon: Cpu, superOnly: true },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon },
  { to: "/admin/people", label: "Admins", icon: Users, superOnly: true },
];

export default function AdminApp() {
  const [admin, setAdmin] = useState(undefined); // undefined while checking, null when signed out
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    document.title = "Admin · UI Postgraduate Assistant";
    api("/me")
      .then((data) => setAdmin(data ?? null))
      .catch(() => setAdmin(null));
  }, []);

  async function signOut() {
    await api("/logout", { method: "POST" }).catch(() => {});
    setAdmin(null);
  }

  if (admin === undefined) return <p className="admin-loading">Loading…</p>;
  if (admin === null) return <Login onSignedIn={setAdmin} />;

  const links = NAV.filter((item) => !item.superOnly || admin.role === "super_admin");

  return (
    <div className="ad-shell">
      <aside className="ad-side">
        <a className="ad-brand" href="/admin">
          <Crest height={34} />
          <span>
            <strong>Admin console</strong>
            <small>UI Postgraduate Assistant</small>
          </span>
        </a>
        <nav className="ad-nav" aria-label="Admin sections">
          {links.map(({ to, end, label, short, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} className="ad-navlink">
              <Icon size={19} aria-hidden="true" />
              <span className="ad-label-long">{label}</span>
              <span className="ad-label-short">{short ?? label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="ad-side-foot">
          <a className="ad-navlink" href="/">
            <span>Open the assistant</span>
          </a>
        </div>
      </aside>

      <div className="ad-main">
        <header className="ad-top">
          <span className="ad-who">
            {admin.name || admin.email}
            <small>{admin.role === "super_admin" ? "Super admin" : "Editor"}</small>
          </span>
          <a className="ad-btn" href="/">
            Student view
          </a>
          <button className="icon-btn" onClick={toggleTheme} aria-label="Switch theme">
            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <button className="ad-btn" onClick={signOut}>
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </header>

        <main className="ad-content">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="knowledge" element={<Knowledge />} />
            <Route path="playground" element={<Playground />} />
            <Route path="insights" element={<Insights />} />
            <Route path="models" element={admin.role === "super_admin" ? <Models /> : <Navigate to="/admin" replace />} />
            <Route path="settings" element={<Settings admin={admin} />} />
            <Route path="people" element={admin.role === "super_admin" ? <People /> : <Navigate to="/admin" replace />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
