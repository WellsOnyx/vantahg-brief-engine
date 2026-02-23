'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0 }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backgroundColor: '#f8f9fb',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '64px',
              height: '64px',
              backgroundColor: '#0c2340',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c9a227',
              fontWeight: 'bold',
              fontSize: '24px',
              margin: '0 auto 24px',
            }}>
              V
            </div>
            <h1 style={{ color: '#0c2340', fontSize: '32px', marginBottom: '8px' }}>
              Critical Error
            </h1>
            <p style={{ color: '#64748b', marginBottom: '24px' }}>
              Something went wrong. Error ID: {error.digest}
            </p>
            <button
              onClick={reset}
              style={{
                padding: '12px 24px',
                backgroundColor: '#0c2340',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
