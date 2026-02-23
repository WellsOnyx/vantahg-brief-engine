'use client';

import { useAuth } from '@/components/AuthProvider';

export function HeaderAuth() {
  const { user, loading, signOut } = useAuth();

  if (loading) return null;

  if (!user) {
    return (
      <a
        href="/login"
        className="hidden md:inline-flex px-3 py-1.5 rounded-md text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200"
      >
        Sign in
      </a>
    );
  }

  return (
    <div className="hidden md:flex items-center gap-3">
      <span className="text-xs text-white/50 truncate max-w-[160px]">
        {user.email}
      </span>
      <button
        onClick={signOut}
        className="px-3 py-1.5 rounded-md text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200"
      >
        Sign out
      </button>
    </div>
  );
}
