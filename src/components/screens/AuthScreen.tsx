'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageTransition } from '@/lib/animations';
import {
  Mail,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface AuthScreenProps {
  onAuthenticated: (email: string) => void;
  initialEmail?: string;
}

// ─── Auth Screen Component ──────────────────────────────────────────────────

const AuthScreen = ({ onAuthenticated, initialEmail }: AuthScreenProps) => {
  const [email, setEmail] = useState(initialEmail || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Authentication failed. Please try again.');
        return;
      }

      // Success — notify parent
      onAuthenticated(data.email);
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth', { method: 'DELETE' });
    } catch {
      // Ignore errors on logout
    }
    setEmail('');
    setError(null);
  };

  return (
    <PageTransition>
      <div className="min-h-screen min-h-[100dvh] flex flex-col items-center justify-center p-6 safe-area-top safe-area-bottom bg-gradient-to-b from-white via-blue-50/30 to-white">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center w-full max-w-sm"
        >
          {/* iAWE App Logo */}
          <motion.div
            initial={{ y: -12, scale: 0.95 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative mb-8"
          >
            <div className="w-28 h-28 md:w-32 md:h-32 rounded-3xl shadow-xl overflow-hidden bg-white p-2">
              <img
                src="/iawe-icon.png"
                alt="iAWE System"
                className="w-full h-full object-contain"
                draggable={false}
              />
            </div>
            {/* Subtle rotating glow ring */}
            <motion.div
              className="absolute -inset-3 rounded-[2rem] -z-10"
              style={{
                background: 'conic-gradient(from 0deg, rgba(30,64,175,0.05), rgba(59,130,246,0.1), rgba(30,64,175,0.05))',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            />
          </motion.div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="text-center mb-2"
          >
            <h1 className="text-2xl md:text-3xl font-bold text-[#1e40af] mb-2">
              iAWE System
            </h1>
            <p className="text-sm text-muted-foreground">
              Authorized Access Only
            </p>
          </motion.div>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.35 }}
            className="text-center text-muted-foreground max-w-xs mb-8 text-sm"
          >
            Sign in with your SQU email address to access the AI-powered writing evaluation system.
          </motion.p>

          {/* Login Form */}
          <motion.form
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            onSubmit={handleSubmit}
            className="w-full space-y-4"
          >
            {/* Email Input */}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="email"
                placeholder="your.name@squ.edu.om"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                className="pl-11 h-14 text-base rounded-xl border-blue-200 focus:border-[#1e40af] focus:ring-[#1e40af]/20"
                disabled={isLoading}
                autoComplete="email"
                autoFocus
              />
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading || !email.trim()}
              className="w-full h-14 text-lg font-semibold bg-[#1e40af] hover:bg-[#1e40af]/90 rounded-2xl shadow-lg shadow-[#1e40af]/25 ios-press disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  Sign In
                </>
              )}
            </Button>
          </motion.form>

          {/* Info text */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.35 }}
            className="text-center text-xs text-muted-foreground mt-6 max-w-xs"
          >
            This system is restricted to authorized SQU faculty members. Contact the administrator if you need access.
          </motion.p>
        </motion.div>
      </div>
    </PageTransition>
  );
};

export default AuthScreen;
