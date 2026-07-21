import { useState } from 'react';
import { auth, googleProvider } from '../config/firebase';
import { signInWithPopup } from 'firebase/auth';

const Login = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in popup was closed before completing. Please try again.');
      } else if (err.code === 'auth/network-request-failed' || err.code === 'auth/internal-error') {
        setError('Network error. Please check your internet connection or ad blockers, and try again.');
      } else {
        setError('Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="app-logo">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1" />
              <path d="M18 8h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4" />
              <line x1="10" y1="12" x2="22" y2="12" />
              <polyline points="15 9 18 12 15 15" />
            </svg>
          </div>
          <h1 className="login-title">CodeSync</h1>
          <p className="login-subtitle">Connect, collaborate, and synchronize your code in real-time.</p>
        </div>

        {error && (
          <div className="login-error">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <button 
          className="google-btn" 
          onClick={handleGoogleSignIn} 
          disabled={loading}
          aria-label="Sign in with Google"
        >
          {loading ? (
            <div className="loading-spinner"></div>
          ) : (
            <>
              <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
                <path
                  fill="#EA4335"
                  d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.54 14.98 1 12 1 7.35 1 3.37 3.65 1.42 7.53l3.85 2.99C6.22 7.15 8.89 5.04 12 5.04z"
                />
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46c-.29 1.48-1.14 2.73-2.4 3.58l3.76 2.91c2.2-2.03 3.67-5.02 3.67-8.64z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.27 14.78a7.07 7.07 0 0 1 0-4.56L1.42 7.23a11.94 11.94 0 0 0 0 9.54l3.85-2.99z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.76-2.91c-1.08.72-2.45 1.16-4.2 1.16-3.11 0-5.78-2.11-6.73-5.48L1.42 16.8A11.94 11.94 0 0 0 12 23z"
                />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default Login;
