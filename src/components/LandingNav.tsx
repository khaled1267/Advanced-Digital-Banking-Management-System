"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ArrowUpRight, Landmark, Menu, Moon, Sun, X } from "lucide-react";

type LandingTheme = "light" | "dark";

function getLandingThemeSnapshot(): LandingTheme {
  return document.documentElement.dataset.landingTheme === "dark" ? "dark" : "light";
}

function getServerLandingThemeSnapshot(): LandingTheme {
  return "light";
}

function subscribeToLandingTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-landing-theme"] });

  function handleStorage(event: StorageEvent) {
    if (event.key !== "northstar-landing-theme") return;
    const nextTheme = event.newValue;
    if (nextTheme === "light" || nextTheme === "dark") {
      document.documentElement.dataset.landingTheme = nextTheme;
    }
  }

  window.addEventListener("storage", handleStorage);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", handleStorage);
  };
}

const links = [
  ["Home", "#home"],
  ["Features", "#features"],
  ["Solutions", "#solutions"],
  ["Security", "#security"],
  ["About", "#about"],
] as const;

export default function LandingNav() {
  const [open, setOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeToLandingTheme, getLandingThemeSnapshot, getServerLandingThemeSnapshot);

  function toggleTheme() {
    const nextTheme: LandingTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.landingTheme = nextTheme;

    try {
      window.localStorage.setItem("northstar-landing-theme", nextTheme);
    } catch {
      // Keep the selected theme for this visit when storage is unavailable.
    }
  }

  function renderThemeToggle(className: string, tabIndex?: number) {
    return (
      <button
        className={className}
        type="button"
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        aria-pressed={theme === "dark"}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        onClick={toggleTheme}
        tabIndex={tabIndex}
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    );
  }

  return (
    <header className="landing-nav-wrap">
      <nav className="landing-nav" aria-label="Main navigation">
        <Link className="landing-brand" href="/" aria-label="Northstar Bank home" onClick={() => setOpen(false)}>
          <span className="landing-brand-mark"><Landmark size={19} strokeWidth={2.2} /></span>
          <span>northstar<span className="landing-brand-dot">.</span></span>
        </Link>

        <div className="landing-desktop-links">
          {links.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
        </div>

        <div className="landing-nav-actions">
          {renderThemeToggle("landing-theme-toggle")}
          <Link className="landing-login" href="/login">Log in</Link>
          <Link className="landing-button landing-button-small" href="/register">Get started <ArrowUpRight size={15} /></Link>
        </div>

        <button
          type="button"
          className="landing-menu-toggle"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
      </nav>
      <div id="landing-mobile-menu" className={`landing-mobile-menu${open ? " is-open" : ""}`} aria-hidden={!open}>
        {links.map(([label, href]) => <a key={href} href={href} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>{label}</a>)}
        {renderThemeToggle("landing-theme-toggle landing-mobile-theme-toggle", open ? 0 : -1)}
        <Link href="/login" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>Log in</Link>
        <Link className="landing-button" href="/register" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>Get started <ArrowUpRight size={16} /></Link>
      </div>
    </header>
  );
}
