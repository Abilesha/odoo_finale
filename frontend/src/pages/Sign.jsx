import { Link } from 'react-router-dom'

/** Old signing links (/sign/…) from before agreements moved into the
 *  couple's portal. Nothing can be signed from a link any more — the couple
 *  signs while signed in to their own account — so this page only points
 *  them there. */
export default function Sign() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-blush-950 bg-cover bg-center px-5 text-sand-50"
         style={{ backgroundImage: "linear-gradient(rgba(42, 15, 25, .86), rgba(42, 15, 25, .92)), url('/auth/couple-blush.png')" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/[0.08] p-8 text-center shadow-2xl backdrop-blur">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gold-400 font-display text-2xl font-bold text-blush-900">R</span>
        <h1 className="mt-5 font-display text-3xl text-white">Your agreement is in your portal</h1>
        <p className="mt-3 text-sm leading-relaxed text-blush-100">
          For your security, the service agreement is signed only after you sign in to your own
          couple account. Use the email your planner gave you.
        </p>
        <Link to="/" className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-gold-400 px-5 py-3 text-sm font-semibold text-blush-900 hover:bg-gold-300">
          Sign in to sign my agreement →
        </Link>
        <p className="mt-4 text-xs text-blush-200/80">No login yet? Ask your planner — they can send one with your agreement.</p>
      </div>
    </div>
  )
}
