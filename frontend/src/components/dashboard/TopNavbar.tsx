"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  Search,
  Bell,
  PanelLeftClose,
  Clock,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  User,
  Settings,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { NOTIFICATIONS } from "@/lib/dummy-data";
import { cn } from "@/lib/utils";

interface TopNavbarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function TopNavbar({ sidebarCollapsed, onToggleSidebar }: TopNavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [theme, setTheme] = useState("dark");
  const unreadCount = NOTIFICATIONS.filter((n) => !n.read).length;

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".notifications-container") && !target.closest(".profile-container")) {
        setShowNotifications(false);
        setShowProfile(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  const toggleTheme = () => {
    setShowNotifications(false);
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

  // Build breadcrumb from pathname
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs = segments.map((seg, i) => ({
    label: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " "),
    href: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));

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

      {/* Right: Search + Status + Time + Notifications + Profile */}
      <div className="flex items-center gap-3">
        {/* Global Search */}
        <button className="hidden md:flex items-center gap-2 rounded-xl border border-border bg-background/30 px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/[0.04] transition-colors">
          <Search className="h-3.5 w-3.5" />
          <span>Search platform...</span>
          <kbd className="ml-4 rounded border border-border bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-mono-numbers">
            ⌘K
          </kbd>
        </button>

        {/* Current Threat Level */}
        <div className="flex items-center gap-2 rounded-full border border-cyber-warning/20 bg-cyber-warning/5 px-3 py-1.5 text-[11px] font-semibold text-cyber-warning uppercase tracking-wider">
          <div className="h-1.5 w-1.5 rounded-full bg-cyber-warning animate-pulse" />
          <span>Threat Level: Elevated</span>
        </div>

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

        {/* Notifications */}
        <div className="relative notifications-container">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfile(false);
            }}
            className="relative p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyber-danger text-[9px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 top-12 w-80 rounded-[18px] border border-border bg-card shadow-2xl shadow-black/40 z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold">Notifications</h3>
                <span className="text-[10px] text-primary font-medium">
                  {unreadCount} new
                </span>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {NOTIFICATIONS.map((notif) => (
                  <div
                    key={notif.id}
                    className={cn(
                      "flex gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-white/[0.02] transition-colors",
                      !notif.read && "bg-primary/[0.02]"
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      notif.severity === "critical" && "bg-cyber-danger/10 text-cyber-danger",
                      notif.severity === "warning" && "bg-cyber-warning/10 text-cyber-warning",
                      notif.severity === "success" && "bg-primary/10 text-primary",
                      notif.severity === "info" && "bg-cyber-info/10 text-cyber-info"
                    )}>
                      <AlertTriangle className="h-3 w-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{notif.title}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{notif.message}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-1">{notif.time}</p>
                    </div>
                    {!notif.read && (
                      <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 border-t border-border">
                <button className="w-full text-center text-xs text-primary hover:text-primary/80 transition-colors">
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative profile-container">
          <button
            onClick={() => {
              setShowProfile(!showProfile);
              setShowNotifications(false);
            }}
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
              <User className="h-3.5 w-3.5 text-primary" />
            </div>
          </button>

          {showProfile && (
            <div className="absolute right-0 top-12 w-56 rounded-[18px] border border-border bg-card shadow-2xl shadow-black/40 z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium">Security Analyst</p>
                <p className="text-xs text-muted-foreground">admin@cybershield.gov.in</p>
              </div>
              <div className="py-1">
                <button 
                  onClick={() => {
                    router.push("/dashboard?tab=settings");
                    setShowProfile(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
                >
                  <User className="h-3.5 w-3.5" />
                  Profile
                </button>
                <button 
                  onClick={() => {
                    router.push("/dashboard?tab=settings");
                    setShowProfile(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </button>
                <button 
                  onClick={() => {
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
