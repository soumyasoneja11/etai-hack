"use client";

import { motion } from "framer-motion";
import { TRUSTED_BY } from "@/lib/dummy-data";

export function TrustedBy() {
  return (
    <section className="relative py-16 border-y border-border">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-xs text-muted-foreground/60 uppercase tracking-[0.2em] mb-10"
        >
          Trusted by National Institutions
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6"
        >
          {TRUSTED_BY.map((name, i) => (
            <motion.div
              key={name}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-2 text-muted-foreground/50 hover:text-primary transition-colors"
            >
              <div className="h-8 w-8 rounded-lg landing-glass flex items-center justify-center">
                <span className="text-xs font-bold font-mono-numbers">
                  {name.charAt(0)}
                </span>
              </div>
              <span className="text-xs font-medium tracking-wide">{name}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
