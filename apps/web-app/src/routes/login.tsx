import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { GalleryVerticalEnd } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { authClient } from '@/lib/auth-client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Discord } from '@/components/logo/Discord'
import { Roblox } from '@/components/logo/Roblox'

type LoginSearch = {
  redirect?: string
  error?: string
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: (search.redirect as string) || '/',
    error: search.error as string,
  }),
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: search.redirect })
    }
  },
  component: LoginPage,
})
function LoginPage() {
  const { auth } = Route.useRouteContext()
  const { redirect: redirectTo, error: socialSignInError } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { error: socialLoginError } = Route.useSearch()
  async function handleSocial(provider: 'discord' | 'roblox') {
    await authClient.signIn.social(
      { provider, callbackURL: '/me', errorCallbackURL: '/login' },
      {
        onRequest: () => {
          setIsLoading(true)
        },
        onSuccess: () => {
          setIsLoading(false)
        },
        onError: () => {
          setIsLoading(false)
        },
      },
    )
  }
  async function handleEmailPassword(e: React.FormEvent) {
    e.preventDefault() // stop page reload
    setIsLoading(true)
    try {
      await auth.login(email, password)
      navigate({ to: redirectTo, search: { redirect: '/' } })
    } catch (err) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        const error = err as { message: string }
        toast.error(error.message)
      }
    } finally {
      setIsLoading(false)
    }
  }
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
        <div className={cn('flex flex-col gap-6')}>
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Welcome back</CardTitle>
              <CardDescription>
                If you already linked your account, you can login with Discord
                or Roblox
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEmailPassword}>
                <div className="grid gap-6">
                  <div className="flex flex-col gap-4">
                    <Button
                      variant="outline"
                      className="w-full"
                      type="button"
                      onClick={() => handleSocial('discord')}
                      disabled={true}
                    >
                      <Discord />
                      {isLoading
                        ? 'Redirecting...'
                        : 'Login with Discord (coming soon)'}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      type="button"
                      onClick={() => handleSocial('roblox')}
                      disabled={isLoading}
                    >
                      <Roblox />
                      {isLoading ? 'Redirecting...' : 'Login with Roblox'}
                    </Button>
                    {socialSignInError === 'signup_disabled' && (
                      <p className="text-center text-sm text-red-600">
                        Account not found. Please sign up or link this social
                        account in your profile settings.
                      </p>
                    )}
                    {socialLoginError &&
                      socialLoginError !== 'signup_disabled' && (
                        <p className="text-center text-sm text-red-600">
                          An unknown error occurred during sign-in.
                        </p>
                      )}
                  </div>
                  <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                    <span className="bg-card text-muted-foreground relative z-10 px-2">
                      Or continue with
                    </span>
                  </div>
                  <div className="grid gap-6">
                    <div className="grid gap-3">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="m@example.com"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-3">
                      <div className="flex items-center">
                        <Label htmlFor="password">Password</Label>
                        <a
                          href="#"
                          className="ml-auto text-sm underline-offset-4 hover:underline"
                        >
                          Forgot your password?
                        </a>
                      </div>
                      <Input
                        id="password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading}
                    >
                      {isLoading ? 'Signing in...' : 'Login'}
                    </Button>
                  </div>
                  <div className="text-center text-sm">
                    Don&apos;t have an account?{' '}
                    <Link
                      to="/register"
                      className="underline underline-offset-4"
                    >
                      Sign up
                    </Link>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
          <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
            By clicking continue, you agree to our{' '}
            <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
          </div>
        </div>{' '}
      </div>
    </div>
  )
}
