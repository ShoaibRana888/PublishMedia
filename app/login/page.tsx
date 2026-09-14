import { AuthForm } from '@/app/components/AuthForm'

export default function LoginPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-5 py-12">
      <AuthForm mode="login" />
    </main>
  )
}
