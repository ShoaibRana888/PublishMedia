'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import {
  login,
  signup,
  signInWithGoogle,
  type AuthState,
} from '@/app/auth/actions'

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const action = mode === 'login' ? login : signup
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    null
  )

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold">PublishMedia</h1>
        <p className="mt-1 text-sm opacity-70">
          {mode === 'login' ? 'Sign in to your dashboard' : 'Create your account'}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-lg border border-black/15 dark:border-white/20 bg-transparent px-3 py-2.5 text-base outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm mb-1">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="w-full rounded-lg border border-black/15 dark:border-white/20 bg-transparent px-3 py-2.5 text-base outline-none focus:border-blue-500"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-red-500" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium disabled:opacity-60 active:bg-blue-700"
        >
          {pending
            ? 'Please wait…'
            : mode === 'login'
              ? 'Sign in'
              : 'Sign up'}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs opacity-60">
        <span className="h-px flex-1 bg-current opacity-30" />
        or
        <span className="h-px flex-1 bg-current opacity-30" />
      </div>

      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="w-full rounded-lg border border-black/15 dark:border-white/25 py-2.5 font-medium flex items-center justify-center gap-2 active:bg-black/5 dark:active:bg-white/10"
        >
          <GoogleIcon />
          Continue with Google
        </button>
      </form>

      <p className="mt-6 text-center text-sm opacity-70">
        {mode === 'login' ? (
          <>
            No account?{' '}
            <Link href="/signup" className="text-blue-600 underline">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}
