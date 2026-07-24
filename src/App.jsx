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
            const data = userDocSnap.data();
            const role = currentUser.email === 'aibaljosej@gmail.com' ? 'admin' : (data.role || 'dev');
            setUser({ ...currentUser, ...data, role })
            setNeedsRegistration(false)
          } else {
            setUser({ ...currentUser, role: currentUser.email === 'aibaljosej@gmail.com' ? 'admin' : 'dev' })
            setNeedsRegistration(true)
          }
        } catch (err) {
          console.error('Error fetching user from Firestore:', err)
          setUser({ ...currentUser, role: currentUser.email === 'aibaljosej@gmail.com' ? 'admin' : 'dev' })
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

  const effectiveRole = user?.email === 'aibaljosej@gmail.com' ? 'admin' : (user?.role || 'dev');
  const canAccessAdmin = user && (effectiveRole === 'admin' || effectiveRole === 'intagrater');

  return (
    <Routes>
      <Route
        path="/admin"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : canAccessAdmin ? (
            <AdminDashboard user={user} />
          ) : (
            <Navigate to="/home" replace />
          )
        }
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
