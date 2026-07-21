"use client";

import { useState, useEffect, Suspense } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopNavbar } from "@/components/dashboard/TopNavbar";
import { ensureAuth } from "@/lib/api-client";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Restore the in-memory access token from the httpOnly refresh cookie on
  // load, so a page reload doesn't drop an otherwise-valid session (P1-8).
  useEffect(() => {
    void ensureAuth();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background relative">
      {/* Cyber Grid Background overlay */}
      <div className="absolute inset-0 bg-grid opacity-[0.5] pointer-events-none" />
      
      {/* Ambient Glow Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-primary/5 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyber-success/3 blur-[140px] pointer-events-none z-0" />
      <div className="absolute top-[35%] left-[25%] w-[40%] h-[40%] rounded-full bg-cyber-purple/3 blur-[120px] pointer-events-none z-0" />

      {/* Sidebar with Suspense boundary */}
      <Suspense fallback={<div className="w-16 h-full bg-sidebar border-r border-border animate-pulse" />}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </Suspense>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden relative z-10">
        <TopNavbar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Suspense fallback={<div className="animate-pulse text-xs text-muted-foreground">Loading screen...</div>}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
