"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Search,
  ChevronLeft,
  ChevronDown,
  LogOut,
  User,
  Moon,
} from "lucide-react";
import { SIDEBAR_SECTIONS, PLATFORM } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<string[]>(
    SIDEBAR_SECTIONS.map((s) => s.title)
  );

  const toggleSection = (title: string) => {
    setExpandedSections((prev) =>
      prev.includes(title)
        ? prev.filter((t) => t !== title)
        : [...prev, title]
    );
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="relative flex h-screen flex-col border-r border-border bg-sidebar overflow-hidden"
    >
      {/* Logo Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-border">
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyber-green/10 border border-cyber-green/20">
            <Shield className="h-4 w-4 text-cyber-green" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="font-heading text-sm font-semibold whitespace-nowrap overflow-hidden"
              >
                {PLATFORM.name}
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
        <button
          onClick={onToggle}
          className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
        >
          <ChevronLeft
            className={cn("h-4 w-4 transition-transform duration-300", collapsed && "rotate-180")}
          />
        </button>
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-3 py-3">
          <div className="flex items-center gap-2 rounded-[14px] border border-border bg-background/30 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
            <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono-numbers">
              ⌘K
            </kbd>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {SIDEBAR_SECTIONS.map((section) => (
          <div key={section.title || "main"} className="mb-2">
            {/* Section Title */}
            {section.title && !collapsed && (
              <button
                onClick={() => toggleSection(section.title)}
                className="flex w-full items-center justify-between px-2 py-1.5 mb-1"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
                  {section.title}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 text-muted-foreground/30 transition-transform",
                    !expandedSections.includes(section.title) && "-rotate-90"
                  )}
                />
              </button>
            )}

            {/* Items */}
            <AnimatePresence initial={false}>
              {(collapsed || !section.title || expandedSections.includes(section.title)) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden space-y-0.5"
                >
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);

                    const linkContent = (
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-150",
                          active
                            ? "bg-cyber-green/10 text-cyber-green border border-cyber-green/15"
                            : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent",
                          collapsed && "justify-center px-2"
                        )}
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", active && "text-cyber-green")} />
                        {!collapsed && (
                          <>
                            <span className="flex-1 truncate text-[13px]">{item.label}</span>
                            {item.badge && (
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                  item.badge === "Live"
                                    ? "bg-cyber-danger/10 text-cyber-danger animate-pulse"
                                    : "bg-cyber-warning/10 text-cyber-warning"
                                )}
                              >
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    );

                    if (collapsed) {
                      return (
                        <Tooltip key={item.href}>
                          <TooltipTrigger render={linkContent} />
                          <TooltipContent side="right" className="text-xs">
                            {item.label}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return <div key={item.href}>{linkContent}</div>;
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-border p-3 space-y-1">
        {collapsed ? (
          <>
            <Tooltip>
              <TooltipTrigger render={
                <button className="flex w-full items-center justify-center rounded-xl p-2 text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors">
                  <Moon className="h-4 w-4" />
                </button>
              } />
              <TooltipContent side="right" className="text-xs">Theme</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={
                <button className="flex w-full items-center justify-center rounded-xl p-2 text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors">
                  <LogOut className="h-4 w-4" />
                </button>
              } />
              <TooltipContent side="right" className="text-xs">Logout</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-xl px-3 py-2 bg-white/[0.02]">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyber-green/10 border border-cyber-green/20">
                <User className="h-3.5 w-3.5 text-cyber-green" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">Security Analyst</p>
                <p className="text-[10px] text-muted-foreground truncate">admin@cybershield.gov.in</p>
              </div>
              <Link href="/auth/login" className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                <LogOut className="h-3.5 w-3.5" />
              </Link>
            </div>
          </>
        )}
      </div>
    </motion.aside>
  );
}
