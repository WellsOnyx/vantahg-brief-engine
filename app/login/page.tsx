'use client';

import { useState } from 'react';
import { createBrowserClient } from '@/lib/supabase-browser';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [useMagicLink, setUseMagicLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = createBrowserClient();

    if (useMagicLink) {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: 'Check your email for the magic link.' });
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        window.location.href = '/';
      }
    }

    setLoading(false);
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-surface rounded-2xl shadow-xl border border-border p-8">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 bg-gold-gradient rounded-lg flex items-center justify-center font-bold text-navy text-lg shadow-md shadow-gold/20">
              V
            </div>
            <span className="font-[family-name:var(--font-dm-serif)] text-2xl tracking-tight text-navy">
              Vanta<span className="text-gold">HG</span>
            </span>
          </div>

          <h1 className="text-xl font-semibold text-center text-foreground mb-6">
            Sign in to your account
          </h1>

          {message && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm ${
                message.type === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
                placeholder="you@example.com"
              />
            </div>

            {!useMagicLink && (
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required={!useMagicLink}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
                  placeholder="Your password"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-navy text-white rounded-lg text-sm font-semibold hover:bg-navy-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : useMagicLink ? 'Send magic link' : 'Sign in'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => {
                setUseMagicLink(!useMagicLink);
                setMessage(null);
              }}
              className="text-sm text-gold-dark hover:text-gold transition-colors"
            >
              {useMagicLink ? 'Use password instead' : 'Use magic link instead'}
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-border text-center">
            <span className="text-sm text-muted">
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="text-gold-dark hover:text-gold font-medium">
                Sign up
              </Link>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
