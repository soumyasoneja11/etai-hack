"use client";

import { useState, useEffect } from "react";
import {
  Search,
  PanelLeftClose,
  Clock,
  User,
  Settings,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/api-client";

interface TopNavbarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function TopNavbar({ onToggleSidebar }: TopNavbarProps) {
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [theme, setTheme] = useState("light");

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".profile-container")) {
        setShowProfile(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  const toggleTheme = () => {
    setShowProfile(false);
    const newTheme = theme === "dark" ? "light" : "dark";
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    setTheme(newTheme);
  };

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-sidebar px-4 lg:px-6">
      {/* Left: Organization Name & Platform Info */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors lg:hidden"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-heading font-semibold text-foreground tracking-wide">
            National Cyber Resilience Centre
          </span>
          <span className="text-[10px] bg-white/[0.04] border border-border px-2 py-0.5 rounded text-muted-foreground font-mono-numbers">
            Gov.IN
          </span>
        </div>
      </div>

      {/* Right: Search + Time + Theme + Profile */}
      <div className="flex items-center gap-3">
        {/* Global Search */}
        <button className="hidden md:flex items-center gap-2 rounded-xl border border-border bg-background/30 px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/[0.04] transition-colors">
          <Search className="h-3.5 w-3.5" />
          <span>Search platform...</span>
          <kbd className="ml-4 rounded border border-border bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-mono-numbers">
            ⌘K
          </kbd>
        </button>

        {/* Time */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono-numbers text-[11px]">{currentTime} IST</span>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
          title="Toggle Color Theme"
        >
          {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
        </button>

        {/* Profile */}
        <div className="relative profile-container">
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
              <User className="h-3.5 w-3.5 text-primary" />
            </div>
          </button>

          {showProfile && (
            <div className="absolute right-0 top-12 w-56 rounded-[18px] border border-border bg-card shadow-2xl shadow-black/40 z-50 overflow-hidden">
              <div className="py-1">
                <button
                  onClick={() => {
                    router.push("/dashboard?tab=settings");
                    setShowProfile(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Profile &amp; Settings
                </button>
                <button
                  onClick={() => {
                    clearToken();
                    router.push("/auth/login");
                    setShowProfile(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-cyber-danger hover:bg-cyber-danger/5 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
