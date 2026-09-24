import { useEffect, useState } from "react";
import { THEME_KEY, readText, writeText } from "../storage";

// index.html already stamped data-theme before first paint; read it back to stay in sync.
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Follow the OS setting until the user picks a theme themselves.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event) => {
      if (!readText(THEME_KEY)) setTheme(event.matches ? "dark" : "light");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    writeText(THEME_KEY, next);
  }

  return { theme, toggleTheme };
}
