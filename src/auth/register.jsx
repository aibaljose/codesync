import { useState } from 'react';
import { db, auth } from '../config/firebase';
import { doc, setDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

const Register = ({ user, onComplete }) => {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [username, setUsername] = useState(
    (user.email ? user.email.split('@')[0] : user.displayName ? user.displayName.toLowerCase().replace(/\s+/g, '_') : '').substring(0, 15)
  );
  const [bio, setBio] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Username validation
    const usernameRegex = /^[a-zA-Z0-9_]{3,15}$/;
    // if (!usernameRegex.test(username)) {
    //   setError('Username must be 3-15 characters and contain only letters, numbers, and underscores.');
    //   setLoading(false);
    //   return;
    // }

    try {
      // Check if username is taken
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', username.toLowerCase()));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        setError('This username is already taken. Please choose another one.');
        setLoading(false);
        return;
      }

      // Save user to Firestore
      const userDocRef = doc(db, 'users', user.uid);
      const userData = {
        uid: user.uid,
        displayName,
        username: username.toLowerCase(),
        email: user.email,
        photoURL: user.photoURL || '',
        bio,
        role: user.email === 'aibaljosej@gmail.com' ? 'admin' : 'dev',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(userDocRef, userData);
      onComplete(userData);
    } catch (err) {
      console.error('Error saving user data:', err);
      setError('Failed to complete registration. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Failed to sign out:', err);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="app-logo">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
          </div>
          <h1 className="login-title">Complete Profile</h1>
          <p className="login-subtitle">Tell us a bit about yourself to complete your registration.</p>
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

        <form onSubmit={handleRegister} className="register-form">
          <div className="form-group">
            <label htmlFor="displayName">Full Name</label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              placeholder="e.g. John Doe"
            />
          </div>

          <div className="form-group">
            <label htmlFor="username">Role</label>
            <div className="username-input-wrapper">
              <span className="username-prefix"></span>
              <input
                type="text"
                id="username"
                value={"Dev"}
                onChange={(e) => setUsername("dev")}
                required
                placeholder="username"
              />
            </div>
          </div>

         

          <div className="button-group">
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? <div className="loading-spinner"></div> : 'Finish Registration'}
            </button>
            <button type="button" className="cancel-btn" onClick={handleCancel} disabled={loading}>
              Cancel & Sign Out
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
