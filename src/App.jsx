import { useState, useEffect } from 'react'
import { auth, db } from './config/firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import Login from './auth/login'
import Register from './auth/register'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'
import ChallengeWorkspace from './components/challenge/ChallengeWorkspace'

function App() {
  const [user, setUser] = useState(null)
  const [needsRegistration, setNeedsRegistration] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [count, setCount] = useState(0)
  const [isChallengeMode, setIsChallengeMode] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            // Merge auth profile with database profile
            setUser({ ...currentUser, ...userDocSnap.data() });
            setNeedsRegistration(false);
          } else {
            setUser(currentUser);
            setNeedsRegistration(true);
          }
        } catch (err) {
          console.error('Error fetching user from Firestore:', err);
          setUser(currentUser);
          setNeedsRegistration(true);
        }
      } else {
        setUser(null);
        setNeedsRegistration(false);
      }
      setAuthLoading(false);
    })
    return () => unsubscribe()
  }, [])

  const handleSignOut = async () => {
    try {
      await signOut(auth)
    } catch (err) {
      console.error('Failed to sign out:', err)
    }
  }

  const handleRegistrationComplete = (userData) => {
    setUser((prev) => ({ ...prev, ...userData }));
    setNeedsRegistration(false);
  }

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner-large" aria-label="Loading application"></div>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  if (needsRegistration) {
    return <Register user={user} onComplete={handleRegistrationComplete} />
  }

  if (isChallengeMode) {
    return <ChallengeWorkspace onExit={() => setIsChallengeMode(false)} />
  }

  return (
    <>
      <header className="app-header">
        <div className="user-profile">
          {user.photoURL && (
            <img 
              src={user.photoURL} 
              alt={user.displayName || 'User Avatar'} 
              className="user-avatar" 
              referrerPolicy="no-referrer"
            />
          )}
          <div className="user-info">
            <span className="user-name">{user.displayName || 'Anonymous User'}</span>
            <span className="user-email">{user.email}</span>
          </div>
        </div>
        <button className="signout-btn" onClick={handleSignOut}>
          Sign Out
        </button>
      </header>

      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>
        <div>
          <h1>Get started</h1>
          <p>
            Welcome, <strong>{user.displayName}</strong>! You have successfully signed in.
          </p>
        </div>
        <button
          type="button"
          className="counter"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>
        <button
          type="button"
          className="counter challenge-btn"
          onClick={() => setIsChallengeMode(true)}
          style={{ marginLeft: '1rem', backgroundColor: '#3b82f6' }}
        >
          Open Challenge Workspace
        </button>
      </section>

      <div className="ticks"></div>

      <section id="next-steps">
        <div id="docs">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#documentation-icon"></use>
          </svg>
          <h2>Documentation</h2>
          <p>Your questions, answered</p>
          <ul>
            <li>
              <a href="https://vite.dev/" target="_blank">
                <img className="logo" src={viteLogo} alt="" />
                Explore Vite
              </a>
            </li>
            <li>
              <a href="https://react.dev/" target="_blank">
                <img className="button-icon" src={reactLogo} alt="" />
                Learn more
              </a>
            </li>
          </ul>
        </div>
        <div id="social">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#social-icon"></use>
          </svg>
          <h2>Connect with us</h2>
          <p>Join the Vite community</p>
          <ul>
            <li>
              <a href="https://github.com/vitejs/vite" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#github-icon"></use>
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a href="https://chat.vite.dev/" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#discord-icon"></use>
                </svg>
                Discord
              </a>
            </li>
            <li>
              <a href="https://x.com/vite_js" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#x-icon"></use>
                </svg>
                X.com
              </a>
            </li>
            <li>
              <a href="https://bsky.app/profile/vite.dev" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#bluesky-icon"></use>
                </svg>
                Bluesky
              </a>
            </li>
          </ul>
        </div>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
