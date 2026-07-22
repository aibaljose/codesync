'use client'

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth, db } from './config/firebase'
import { collection, getDocs, doc, runTransaction, query, where } from 'firebase/firestore'
import { Dialog, DialogPanel } from '@headlessui/react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import ChallengeWorkspace from './components/challenge/ChallengeWorkspace'

export default function Home({ user }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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
  }, [user?.uid])

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
        user={user}
        onExit={() => setIsChallengeMode(false)}
        ticketUrl={assignedTicket?.url}
        ticketName={assignedTicket?.storedAs || assignedTicket?.fileName}
        ticketId={assignedTicket?.id}
      />
    )
  }

  const displayName = user?.displayName || 'Tom Shibu'
  const ticketIdDisplay = assignedTicket?.id ? `Ticket #${assignedTicket.id}` : 'Ticket #4'


  return (
    <div className="bg-gray-900 min-h-screen text-white font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header & Navigation */}
      <header className="absolute inset-x-0 top-0 z-50">
        <nav
          aria-label="Global"
          className="flex items-center justify-between p-6 lg:px-8 max-w-6xl mx-auto"
        >
          <div className="flex lg:flex-1">
            <a href="#" className="-m-1.5 p-1.5 flex items-center gap-2.5">
              <span className="sr-only">CodeSync Enterprise</span>
              <div className="h-8 w-10 rounded-lg bg-linear-to-tr from-indigo-500 to-sky-400 flex items-center justify-center font-bold text-white text-base shadow-lg shadow-indigo-500/20">
                CS
              </div>
              <span className="text-lg font-bold tracking-tight text-white">
                CodeSync
              </span>
            </a>
          </div>
          <div className="flex lg:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-200 hover:text-white"
            >
              <span className="sr-only">Open main menu</span>
              <Bars3Icon aria-hidden="true" className="size-6" />
            </button>
          </div>
          <div className="hidden lg:flex lg:gap-x-12">
            <p className="-mx-3 block w-full text-left rounded-lg px-3 py-2 text-base/7 font-semibold text-white bg-transparent border-0">
              Beginners
            </p>
            <p className="-mx-3 block w-full text-left rounded-lg px-3 py-2 text-base/7 font-semibold text-white bg-transparent border-0">
              Professionals
            </p>
            <p className="-mx-3 block w-full text-left rounded-lg px-3 py-2 text-base/7 font-semibold text-white bg-transparent border-0">
              Architects
            </p>
          </div>
          <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:items-center lg:gap-x-4">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-gray-200">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={displayName}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/80 text-xs font-semibold text-white">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span>{displayName}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="text-sm/6 font-semibold text-gray-300 hover:text-white transition-colors bg-transparent border-0 cursor-pointer"
            >
              Sign out <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </nav>
        <Dialog
          open={mobileMenuOpen}
          onClose={setMobileMenuOpen}
          className="lg:hidden"
        >
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs" />
          <DialogPanel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-gray-900 p-6 sm:max-w-sm sm:ring-1 sm:ring-gray-100/10">
            <div className="flex items-center justify-between">
              <a href="#" className="-m-1.5 p-1.5 flex items-center gap-2">
                <span className="sr-only">CodeSync Enterprise</span>
                <div className="h-8 w-8 rounded-lg bg-linear-to-tr from-indigo-500 to-sky-400 flex items-center justify-center font-bold text-gray-950 text-base">
                  CS
                </div>
                <span className="text-lg font-bold text-white">CodeSync</span>
              </a>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="-m-2.5 rounded-md p-2.5 text-gray-200 hover:text-white"
              >
                <span className="sr-only">Close menu</span>
                <XMarkIcon aria-hidden="true" className="size-6" />
              </button>
            </div>
            <div className="mt-6 flow-root">
              <div className="-my-6 divide-y divide-white/10">
                <div className="space-y-2 py-6">
                  <p className="-mx-3 block w-full text-left rounded-lg px-3 py-2 text-base/7 font-semibold text-white bg-transparent border-0">
                    Beginners
                  </p>
                  <p className="-mx-3 block w-full text-left rounded-lg px-3 py-2 text-base/7 font-semibold text-white bg-transparent border-0">
                    Professionals
                  </p>
                  <p className="-mx-3 block w-full text-left rounded-lg px-3 py-2 text-base/7 font-semibold text-white bg-transparent border-0">
                    Architects
                  </p>
                </div>
                <div className="py-6 space-y-2">
                  <button
                    onClick={() => {
                      handleSignOut();
                      setMobileMenuOpen(false);
                    }}
                    className="-mx-3 block w-full text-left rounded-lg px-3 py-2.5 text-base/7 font-semibold text-gray-300 hover:bg-white/5 bg-transparent border-0 cursor-pointer"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </DialogPanel>
        </Dialog>
      </header>

      {/* Hero Section with Polygon Blurs */}
      <div className="relative isolate px-6 pt-14 lg:px-8">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80 pointer-events-none"
        >
          <div
            style={{
              clipPath:
                "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
            }}
            className="relative left-[calc(50%-11rem)] aspect-1155/678 w-144.5 -translate-x-1/2 rotate-30 bg-linear-to-tr from-[#ff80b5] to-[#9089fc] opacity-30 sm:left-[calc(50%-30rem)] sm:w-288.75"
          />
        </div>

        <div className="mx-auto max-w-3xl py-32 sm:py-48 lg:py-22">
          <div className="text-center" id="workspace">
            <h1 className="text-5xl font-semibold tracking-tight text-balance text-white sm:text-7xl">
             Build an Entire Website in Just 60 Minutes
            </h1>
            <p className="mt-8 text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
              Welcome back, {displayName}.<br />
              <p className="text-lg font-medium text-pretty text-gray-400">
                Join 60+ developers for a fast-paced, hands-on live coding session where we'll design, build, and deploy a complete modern website from scratch—all in just one hour.
              </p>
            </p>

            <div className="mt-10 flex items-center justify-center gap-x-6">
              <button
                onClick={() => setIsChallengeMode(true)}
                disabled={ticketLoading && !assignedTicket}
                className="rounded-md bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-xs hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5 shadow-lg shadow-indigo-500/25"
              >
                {ticketLoading
                  ? "Allocating Workspace..."
                  : "Launch Challenge Workspace"}
              </button>

              {assignedTicket?.url ? (
                <a
                  href={assignedTicket.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm/6 font-semibold text-white hover:text-gray-300 transition-colors"
                >
                  Download Archive <span aria-hidden="true">→</span>
                </a>
              ) : (
                <button
                  onClick={() => navigate("/admin")}
                  className="text-sm/6 font-semibold text-white hover:text-gray-300 transition-colors bg-transparent border-0 cursor-pointer"
                >
                  View Control Center <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}