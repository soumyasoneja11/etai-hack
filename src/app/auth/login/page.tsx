"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Shield, Eye, EyeOff, ArrowRight, KeyRound, Building2 } from "lucide-react";
import { PLATFORM } from "@/lib/constants";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // TODO: Connect to authentication backend
    setTimeout(() => {
      router.push("/dashboard");
    }, 1200);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated grid background */}
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-br from-cyber-green/[0.02] via-transparent to-cyber-purple/[0.02]" />

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-cyber-green/20"
            initial={{
              x: Math.random() * (typeof window !== "undefined" ? window.innerWidth : 1400),
              y: Math.random() * (typeof window !== "undefined" ? window.innerHeight : 900),
            }}
            animate={{
              y: [null, Math.random() * -200],
              opacity: [0, 0.6, 0],
            }}
            transition={{
              duration: 4 + Math.random() * 4,
              repeat: Infinity,
              delay: Math.random() * 4,
            }}
          />
        ))}
      </div>

      {/* Login Card */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md mx-6"
      >
        <div className="rounded-[20px] border border-border bg-card/80 backdrop-blur-xl p-8 lg:p-10 shadow-2xl shadow-black/40">
          {/* Logo */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyber-green/10 border border-cyber-green/20">
                <Shield className="h-5 w-5 text-cyber-green" />
              </div>
              <span className="font-heading text-xl font-semibold">{PLATFORM.name}</span>
            </Link>
            <h1 className="font-heading text-2xl font-bold mb-2">Welcome back</h1>
            <p className="text-sm text-muted-foreground">
              Sign in to access the Cyber Resilience Platform
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                placeholder="analyst@cybershield.gov.in"
                defaultValue="admin@cybershield.gov.in"
                className="w-full rounded-[14px] border border-border bg-background/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-cyber-green/30 focus:border-cyber-green/40 transition-all"
                required
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  Password
                </label>
                <Link href="#" className="text-xs text-cyber-green hover:text-cyber-green/80 transition-colors">
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••••"
                  defaultValue="cybershield2026"
                  className="w-full rounded-[14px] border border-border bg-background/50 px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-cyber-green/30 focus:border-cyber-green/40 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded border-border bg-background accent-cyber-green"
              />
              <label htmlFor="remember" className="text-sm text-muted-foreground">
                Remember this device
              </label>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-[14px] bg-cyber-green px-6 py-3 text-sm font-semibold text-black hover:bg-cyber-green/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="h-4 w-4 border-2 border-black/20 border-t-black rounded-full"
                />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-3 text-muted-foreground">or continue with</span>
            </div>
          </div>

          {/* SSO Options */}
          <div className="grid grid-cols-2 gap-3">
            <button className="flex items-center justify-center gap-2 rounded-[14px] border border-border bg-white/[0.03] px-4 py-2.5 text-sm text-foreground hover:bg-white/[0.06] transition-colors">
              <KeyRound className="h-4 w-4 text-cyber-info" />
              SSO Login
            </button>
            <button className="flex items-center justify-center gap-2 rounded-[14px] border border-border bg-white/[0.03] px-4 py-2.5 text-sm text-foreground hover:bg-white/[0.06] transition-colors">
              <Building2 className="h-4 w-4 text-cyber-purple" />
              Gov Login
            </button>
          </div>

          {/* Help text */}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Protected by MFA and Government Security Standards.{" "}
            <Link href="#" className="text-cyber-green hover:underline">
              Need help?
            </Link>
          </p>
        </div>

        {/* Bottom org badge */}
        <p className="mt-6 text-center text-xs text-muted-foreground/50">
          {PLATFORM.org} • v{PLATFORM.version}
        </p>
      </motion.div>
    </div>
  );
}
