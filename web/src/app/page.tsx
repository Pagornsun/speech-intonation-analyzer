"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function HomePage() {
  return (
    <div className="relative flex min-h-[calc(100vh-0px)] w-full flex-col font-display overflow-x-hidden bg-background-dark text-white">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background-dark via-[#0f1120] to-[#1a1c2e] opacity-90" />

      {/* Floating glow orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute w-64 h-64 bg-primary/20 rounded-full blur-3xl top-24 left-20"
          animate={{ y: [0, 40, 0], x: [0, -28, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-96 h-96 bg-secondary/20 rounded-full blur-3xl bottom-10 right-10"
          animate={{ y: [0, -30, 0], x: [0, 30, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Hero */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 md:px-16 lg:px-28">
        <div className="grid w-full max-w-6xl grid-cols-1 items-center gap-16 lg:grid-cols-2">
          {/* Text */}
          <div className="flex flex-col gap-6 text-center lg:text-left">
            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="text-5xl md:text-6xl font-extrabold leading-tight tracking-tight"
            >
              Analyze your speech <br />
              with <span className="text-primary">AI</span>.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.6 }}
              className="text-gray-400 text-lg leading-relaxed max-w-md mx-auto lg:mx-0"
            >
              Improve your communication by analyzing your speech intonation using our
              AI-powered platform. Get real-time feedback and master your delivery with
              confidence.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="flex justify-center lg:justify-start"
            >
              <Link
                href="/analyze"
                className="relative inline-flex items-center justify-center px-8 py-3 text-lg font-semibold text-white bg-primary rounded-xl shadow-lg shadow-primary/40 transition-all duration-300 hover:scale-105 hover:shadow-primary/60"
              >
                Start Recording
                <span className="material-symbols-outlined ml-2 text-base">mic</span>
                <span className="pointer-events-none absolute -inset-0.5 rounded-xl bg-primary/30 blur-xl opacity-0 transition-opacity duration-300 hover:opacity-100" />
              </Link>
            </motion.div>
          </div>

          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            className="flex items-center justify-center"
          >
            <div className="relative w-72 h-72 md:w-96 md:h-96 flex items-center justify-center">
              <motion.div
                className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary/30 to-secondary/20 blur-3xl"
                animate={{ scale: [1, 1.18, 1], opacity: [0.45, 0.85, 0.45] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.img
                src="https://images.unsplash.com/photo-1511367461989-f85a21fda167?q=80&w=600&auto=format&fit=crop"
                alt="Speech visualization"
                className="relative z-10 rounded-full w-48 h-48 object-cover shadow-lg shadow-primary/30"
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </motion.div>
        </div>
      </main>

    
    </div>
  );
}
