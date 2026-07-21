import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth, db } from './config/firebase'
import { collection, getDocs, doc, runTransaction, query, where } from 'firebase/firestore'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import ChallengeWorkspace from './components/challenge/ChallengeWorkspace'

function Home({ user }) {
  const [count, setCount] = useState(0)
  const [isChallengeMode, setIsChallengeMode] = useState(false)
  const [assignedTicket, setAssignedTicket] = useState(null)
  const [ticketLoading, setTicketLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    if (!user?.uid) return

    const assignTicket = async () => {
      setTicketLoading(true)
      try {
        const userRef = doc(db, 'users', user.uid)

        // If the user already has a ticket assigned, just fetch and show it
        if (user.ticketId) {
          const ticketSnap = await getDocs(
            query(collection(db, 'tickets'), where('__name__', '==', user.ticketId))
          )
          if (!ticketSnap.empty) {
            setAssignedTicket({ id: user.ticketId, ...ticketSnap.docs[0].data() })
          }
          return
        }

        // First login: fetch all unassigned tickets
        const ticketsSnap = await getDocs(
          query(collection(db, 'tickets'), where('assignedTo', '==', null))
        )

        if (ticketsSnap.empty) {
          console.warn('No unassigned tickets available.')
          return
        }

        // Pick a random one from the unassigned pool
        const available = ticketsSnap.docs
        const chosen = available[Math.floor(Math.random() * available.length)]

        // Atomically: mark ticket as assigned + save ticketId on user doc
        await runTransaction(db, async (tx) => {
          const freshTicket = await tx.get(chosen.ref)
          // Guard: another user may have grabbed it in the same instant
          if (freshTicket.data()?.assignedTo !== null) {
            throw new Error('Ticket already taken — retrying...')
          }
          tx.update(chosen.ref, { assignedTo: user.uid })
          tx.update(userRef, { ticketId: chosen.id })
        })

        setAssignedTicket({ id: chosen.id, ...chosen.data() })
      } catch (err) {
        console.error('Ticket assignment error:', err)
      } finally {
        setTicketLoading(false)
      }
    }

    assignTicket()
  }, [user?.uid]) // runs once per user session

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      navigate('/login')
    } catch (err) {
      console.error('Failed to sign out:', err)
    }
  }

  if (isChallengeMode) {
    return (
      <ChallengeWorkspace
        onExit={() => setIsChallengeMode(false)}
        ticketUrl={assignedTicket?.url}
        ticketName={assignedTicket?.storedAs || assignedTicket?.fileName}
      />
    )
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

        {/* Assigned Ticket Card */}
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem 1.5rem',
          border: '1px solid var(--border, #e2e8f0)',
          borderRadius: '0.75rem',
          background: 'var(--card-bg, #f8fafc)',
          textAlign: 'left',
          maxWidth: '420px',
          width: '100%'
        }}>
          <p style={{ fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>
            🎫 Your Assigned Ticket
          </p>
          {ticketLoading ? (
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Assigning ticket…</p>
          ) : assignedTicket ? (
            <>
              <p style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.25rem' }}>
                {assignedTicket.storedAs || assignedTicket.fileName}
              </p>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.75rem' }}>
                Ticket #{assignedTicket.id}
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <a
                  href={assignedTicket.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '0.85rem', color: '#3b82f6', textDecoration: 'underline' }}
                >
                  Download ↗
                </a>
                <button
                  onClick={() => setIsChallengeMode(true)}
                  style={{
                    fontSize: '0.85rem',
                    padding: '0.35rem 0.85rem',
                    background: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '0.4rem',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Open in Challenge Workspace →
                </button>
              </div>
            </>
          ) : (
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>No tickets available right now.</p>
          )}
        </div>
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
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#github-icon"></use>
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a href="https://chat.vite.dev/" target="_blank">
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#discord-icon"></use>
                </svg>
                Discord
              </a>
            </li>
            <li>
              <a href="https://x.com/vite_js" target="_blank">
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#x-icon"></use>
                </svg>
                X.com
              </a>
            </li>
            <li>
              <a href="https://bsky.app/profile/vite.dev" target="_blank">
                <svg className="button-icon" role="presentation" aria-hidden="true">
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

export default Home