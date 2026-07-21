import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { auth, db } from './config/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import Login from './auth/login'
import Register from './auth/register'
import Home from './home'
import './App.css'
import AdminDashboard from './admin/AdminDashboard'
import { useUserPresence } from './hooks/useUserPresence'

function App() {
  const [user, setUser] = useState(null)
  const [needsRegistration, setNeedsRegistration] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const navigate = useNavigate()

  // Track real-time presence in Firebase Realtime Database
  useUserPresence(user)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid)
          const userDocSnap = await getDoc(userDocRef)
          if (userDocSnap.exists()) {
            setUser({ ...currentUser, ...userDocSnap.data() })
            setNeedsRegistration(false)
          } else {
            setUser(currentUser)
            setNeedsRegistration(true)
          }
        } catch (err) {
          console.error('Error fetching user from Firestore:', err)
          setUser(currentUser)
          setNeedsRegistration(true)
        }
      } else {
        setUser(null)
        setNeedsRegistration(false)
      }
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const handleRegistrationComplete = (userData) => {
    setUser((prev) => ({ ...prev, ...userData }))
    setNeedsRegistration(false)
    navigate('/home')
  }

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner-large" aria-label="Loading application"></div>
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/admin"
        element={<AdminDashboard user={user} />}
      />  
      <Route
        path="/login"
        element={
          !user
            ? <Login />
            : needsRegistration
              ? <Navigate to="/register" replace />
              : <Navigate to="/home" replace />
        }
      />
      <Route
        path="/register"
        element={
          user && needsRegistration
            ? <Register user={user} onComplete={handleRegistrationComplete} />
            : <Navigate to={user ? '/home' : '/login'} replace />
        }
      />
      <Route
        path="/home"
        element={user && !needsRegistration ? <Home user={user} /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={user ? '/home' : '/login'} replace />} />
    </Routes>
  )
}

export default App
