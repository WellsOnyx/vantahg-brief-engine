import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-16 h-16 bg-gold-gradient rounded-2xl flex items-center justify-center font-bold text-navy text-2xl mx-auto mb-6 shadow-lg shadow-gold/20">
          V
        </div>
        <h1 className="text-6xl font-bold text-navy mb-2">404</h1>
        <h2 className="text-xl font-semibold text-foreground mb-4">Page not found</h2>
        <p className="text-muted mb-8 max-w-md mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-navy text-white rounded-lg text-sm font-semibold hover:bg-navy-light transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
