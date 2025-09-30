import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { GalleryVerticalEnd } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { LoginForm } from '@/components/login-form'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      redirect: (search.redirect as string) || '/profile',
      error: search.error as string,
    }
  },
  beforeLoad: async ({ search }) => {
    const session = await authClient.getSession()

    if (session.data) {
      throw redirect({
        to: search.redirect,
      })
    }
  },
  component: LoginPage,
})
function LoginPage() {
  const { error } = Route.useSearch()

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link
          to="/"
          className="flex items-center gap-2 self-center font-medium"
        >
          <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
            <GalleryVerticalEnd className="size-4" />
          </div>
          Bloxtr8
        </Link>
        {error && (
          <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
            {error}
          </div>
        )}
        <LoginForm />
      </div>
    </div>
  )
}
