"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Shield, Menu, X, Sun, Moon } from "lucide-react";
import { LANDING_NAV_ITEMS, PLATFORM } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    queueMicrotask(() => {
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    });
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    setTheme(newTheme);
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);



  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled ? "glass-strong shadow-lg shadow-black/20" : "bg-transparent"
      )}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 group-hover:bg-primary/15 transition-colors">
              <Shield className="h-4.5 w-4.5 text-primary" />
            </div>
            <span className="font-heading text-lg font-semibold tracking-tight text-foreground">
              {PLATFORM.name}
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-1">
            {LANDING_NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="px-3.5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-white/[0.04]"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* CTA + Theme + Mobile Toggle */}
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
              title="Toggle Color Theme"
            >
              {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>

            <Link
              href="/dashboard"
              className="hidden sm:inline-flex items-center gap-2 rounded-[14px] bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Launch Platform
            </Link>

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="lg:hidden glass-strong border-t border-border"
        >
          <div className="px-6 py-4 space-y-1">
            {LANDING_NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="block px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-white/[0.04]"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/dashboard"
              className="block mt-3 text-center rounded-[14px] bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
              onClick={() => setMobileOpen(false)}
            >
              Launch Platform
            </Link>
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
}
