'use client'

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth, db } from './config/firebase'
import { collection, getDocs, doc, runTransaction, query, where } from 'firebase/firestore'
import { Dialog, DialogPanel } from '@headlessui/react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import ChallengeWorkspace from './components/challenge/ChallengeWorkspace'
import './Home.css'

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
      />
    )
  }

  const displayName = user?.displayName || 'Tom Shibu'
  const ticketIdDisplay = assignedTicket?.id ? `Ticket #${assignedTicket.id}` : 'Ticket #4'

  const navigation = [
    { name: 'Live Control Center', href: '#', onClick: () => navigate('/admin') },
    { name: 'Challenge Workspace', href: '#workspace', onClick: () => setIsChallengeMode(true) },
    { name: 'Architecture', href: '#architecture', onClick: () => {} },
  ]

  return (
    <div className="bg-gray-900 min-h-screen text-white font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header & Navigation */}
      <header className="absolute inset-x-0 top-0 z-50">
        <nav aria-label="Global" className="flex items-center justify-between p-6 lg:px-8 max-w-7xl mx-auto">
          <div className="flex lg:flex-1">
            <a href="#" className="-m-1.5 p-1.5 flex items-center gap-2.5">
              <span className="sr-only">CodeSync Enterprise</span>
              <div className="h-8 w-8 rounded-lg bg-linear-to-tr from-indigo-500 to-sky-400 flex items-center justify-center font-bold text-gray-950 text-base shadow-lg shadow-indigo-500/20">
                CS
              </div>
              <span className="text-lg font-bold tracking-tight text-white">CodeSync</span>
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
            {navigation.map((item) => (
              <button
                key={item.name}
                onClick={item.onClick}
                className="text-sm/6 font-semibold text-gray-200 hover:text-white transition-colors bg-transparent border-0 cursor-pointer"
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:items-center lg:gap-x-6">
            <button
              onClick={() => navigate('/admin')}
              className="text-sm/6 font-semibold text-sky-400 hover:text-sky-300 transition-colors bg-transparent border-0 cursor-pointer"
            >
              Control Center
            </button>
            <button
              onClick={handleSignOut}
              className="text-sm/6 font-semibold text-gray-300 hover:text-white transition-colors bg-transparent border-0 cursor-pointer"
            >
              Sign out <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </nav>
        <Dialog open={mobileMenuOpen} onClose={setMobileMenuOpen} className="lg:hidden">
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
                  {navigation.map((item) => (
                    <button
                      key={item.name}
                      onClick={() => {
                        item.onClick()
                        setMobileMenuOpen(false)
                      }}
                      className="-mx-3 block w-full text-left rounded-lg px-3 py-2 text-base/7 font-semibold text-white hover:bg-white/5 bg-transparent border-0 cursor-pointer"
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
                <div className="py-6 space-y-2">
                  <button
                    onClick={() => {
                      navigate('/admin')
                      setMobileMenuOpen(false)
                    }}
                    className="-mx-3 block w-full text-left rounded-lg px-3 py-2.5 text-base/7 font-semibold text-sky-400 hover:bg-white/5 bg-transparent border-0 cursor-pointer"
                  >
                    Control Center
                  </button>
                  <button
                    onClick={() => {
                      handleSignOut()
                      setMobileMenuOpen(false)
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
                'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
            }}
            className="relative left-[calc(50%-11rem)] aspect-1155/678 w-144.5 -translate-x-1/2 rotate-30 bg-linear-to-tr from-[#ff80b5] to-[#9089fc] opacity-30 sm:left-[calc(50%-30rem)] sm:w-288.75"
          />
        </div>

        <div className="mx-auto max-w-3xl py-32 sm:py-48 lg:py-56">
          <div className="hidden sm:mb-8 sm:flex sm:justify-center">
            <div className="relative rounded-full px-4 py-1.5 text-sm/6 text-gray-400 ring-1 ring-white/10 hover:ring-white/20 backdrop-blur-md bg-white/5 transition-all">
              ENTERPRISE PRO v2.4 • Cloud Sync: Active.{' '}
              <button
                onClick={() => navigate('/admin')}
                className="font-semibold text-indigo-400 hover:text-indigo-300 bg-transparent border-0 cursor-pointer p-0 ml-1 inline-flex items-center"
              >
                <span aria-hidden="true" className="absolute inset-0" />
                Live Control Center <span aria-hidden="true">&rarr;</span>
              </button>
            </div>
          </div>

          <div className="text-center" id="workspace">
            <h1 className="text-5xl font-semibold tracking-tight text-balance text-white sm:text-7xl">
              Real-time Interactive Coding & Cloud R2 Synchronization
            </h1>
            <p className="mt-8 text-lg font-medium text-pretty text-gray-400 sm:text-xl/8">
              Welcome back, {displayName}.<br />
              Your high-performance workspace for real-time coding challenges, automated validation, and direct Cloudflare R2 archive storage.
            </p>

            <div className="mt-10 flex items-center justify-center gap-x-6">
              <button
                onClick={() => setIsChallengeMode(true)}
                disabled={ticketLoading && !assignedTicket}
                className="rounded-md bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-xs hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5 shadow-lg shadow-indigo-500/25"
              >
                {ticketLoading ? 'Allocating Workspace...' : 'Launch Challenge Workspace'}
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
                  onClick={() => navigate('/admin')}
                  className="text-sm/6 font-semibold text-white hover:text-gray-300 transition-colors bg-transparent border-0 cursor-pointer"
                >
                  View Control Center <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Telemetry & Storage Metrics Grid */}
        <div className="mx-auto max-w-5xl pb-24">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-md">
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Assigned Ticket ID</dt>
              <dd className="mt-2 text-2xl font-bold tracking-tight text-white">{ticketLoading ? 'Assigning...' : ticketIdDisplay}</dd>
            </div>

            <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-md">
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Storage Engine</dt>
              <dd className="mt-2 text-2xl font-bold tracking-tight text-white">Cloudflare R2 (submitted/)</dd>
            </div>

            <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-md">
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Presence Telemetry</dt>
              <dd className="mt-2 text-2xl font-bold tracking-tight text-white">Real-time Active Stream</dd>
            </div>
          </div>
        </div>

        {/* Platform Capabilities Section */}
        <div className="mx-auto max-w-5xl pb-32" id="architecture">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Platform Capabilities & Architecture</h2>
            <p className="mt-4 text-base text-gray-400">
              Designed for scalable assessment workflows and zero-friction code submission
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/5 p-8 ring-1 ring-white/10 backdrop-blur-md hover:bg-white/10 transition-all border-l-4 border-indigo-500">
              <h3 className="text-lg font-semibold text-white">Interactive Split-Pane IDE</h3>
              <p className="mt-3 text-sm/6 text-gray-400">
                Experience real-time code editing with Monaco editor, instant DOM rendering preview pane, and an integrated asset explorer.
              </p>
            </div>

            <div className="rounded-2xl bg-white/5 p-8 ring-1 ring-white/10 backdrop-blur-md hover:bg-white/10 transition-all border-l-4 border-sky-400">
              <h3 className="text-lg font-semibold text-white">Cloudflare R2 Direct Submission</h3>
              <p className="mt-3 text-sm/6 text-gray-400">
                On submit, your project is automatically packaged via JSZip, tagged with metadata, and uploaded to the ticket-storage/submitted/ folder.
              </p>
            </div>

            <div className="rounded-2xl bg-white/5 p-8 ring-1 ring-white/10 backdrop-blur-md hover:bg-white/10 transition-all border-l-4 border-pink-500">
              <h3 className="text-lg font-semibold text-white">Real-time Control Center</h3>
              <p className="mt-3 text-sm/6 text-gray-400">
                Admins monitor live connected users, session duration, and instant submission feeds with one-click direct R2 download links.
              </p>
            </div>

            <div className="rounded-2xl bg-white/5 p-8 ring-1 ring-white/10 backdrop-blur-md hover:bg-white/10 transition-all border-l-4 border-purple-500">
              <h3 className="text-lg font-semibold text-white">Atomic Ticket Allocation</h3>
              <p className="mt-3 text-sm/6 text-gray-400">
                Firebase Firestore transactions prevent race conditions by guaranteeing each challenge zip is exclusively assigned to a single developer.
              </p>
            </div>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)] pointer-events-none"
        >
          <div
            style={{
              clipPath:
                'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
            }}
            className="relative left-[calc(50%+3rem)] aspect-1155/678 w-144.5 -translate-x-1/2 bg-linear-to-tr from-[#ff80b5] to-[#9089fc] opacity-30 sm:left-[calc(50%+36rem)] sm:w-288.75"
          />
        </div>
      </div>
    </div>
  )
}