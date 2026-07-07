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
} from "lucide-react";
import { NOTIFICATIONS } from "@/lib/dummy-data";
import { cn } from "@/lib/utils";

interface TopNavbarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function TopNavbar({ sidebarCollapsed, onToggleSidebar }: TopNavbarProps) {
  const pathname = usePathname();
  const [currentTime, setCurrentTime] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const unreadCount = NOTIFICATIONS.filter((n) => !n.read).length;

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
      {/* Left: Toggle + Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors lg:hidden"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>

        {/* Breadcrumb */}
        <nav className="hidden sm:flex items-center gap-1 text-sm">
          {breadcrumbs.map((crumb, i) => (
            <div key={crumb.href} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
              <span
                className={cn(
                  "text-[13px]",
                  crumb.isLast ? "text-foreground font-medium" : "text-muted-foreground"
                )}
              >
                {crumb.label}
              </span>
            </div>
          ))}
        </nav>
      </div>

      {/* Right: Search + Status + Time + Notifications + Profile */}
      <div className="flex items-center gap-2">
        {/* Global Search */}
        <button className="hidden md:flex items-center gap-2 rounded-xl border border-border bg-background/30 px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/[0.04] transition-colors">
          <Search className="h-3.5 w-3.5" />
          <span>Search...</span>
          <kbd className="ml-4 rounded border border-border bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-mono-numbers">
            ⌘K
          </kbd>
        </button>

        {/* System Status */}
        <div className="hidden lg:flex items-center gap-1.5 rounded-xl border border-border bg-background/30 px-3 py-1.5">
          <CheckCircle2 className="h-3 w-3 text-cyber-green" />
          <span className="text-[11px] text-muted-foreground">All Systems Operational</span>
        </div>

        {/* Time */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span className="font-mono-numbers text-[11px]">{currentTime} IST</span>
        </div>

        {/* Notifications */}
        <div className="relative">
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
                <span className="text-[10px] text-cyber-green font-medium">
                  {unreadCount} new
                </span>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {NOTIFICATIONS.map((notif) => (
                  <div
                    key={notif.id}
                    className={cn(
                      "flex gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-white/[0.02] transition-colors",
                      !notif.read && "bg-cyber-green/[0.02]"
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      notif.severity === "critical" && "bg-cyber-danger/10 text-cyber-danger",
                      notif.severity === "warning" && "bg-cyber-warning/10 text-cyber-warning",
                      notif.severity === "success" && "bg-cyber-green/10 text-cyber-green",
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
                      <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-cyber-green" />
                    )}
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 border-t border-border">
                <button className="w-full text-center text-xs text-cyber-green hover:text-cyber-green/80 transition-colors">
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => {
              setShowProfile(!showProfile);
              setShowNotifications(false);
            }}
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyber-green/10 border border-cyber-green/20">
              <User className="h-3.5 w-3.5 text-cyber-green" />
            </div>
          </button>

          {showProfile && (
            <div className="absolute right-0 top-12 w-56 rounded-[18px] border border-border bg-card shadow-2xl shadow-black/40 z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium">Security Analyst</p>
                <p className="text-xs text-muted-foreground">admin@cybershield.gov.in</p>
              </div>
              <div className="py-1">
                <button className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors">
                  <User className="h-3.5 w-3.5" />
                  Profile
                </button>
                <button className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors">
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </button>
                <button className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-cyber-danger hover:bg-cyber-danger/5 transition-colors">
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
