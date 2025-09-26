import { Link } from '@tanstack/react-router'
import { useState } from 'react'
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

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleEmailPassword(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await authClient.signIn.email(
      {
        email,
        password,
        callbackURL: '/user',
      },
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
    if (error) {
      console.error(error.statusText)
    }
  }

  async function handleSocial(provider: 'discord' | 'roblox') {
    const { error } = await authClient.signIn.social(
      { provider, callbackURL: '/user' },
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
    if (error) {
      console.error(error.statusText)
    }
  }
  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>
            If you already linked your account, you can login with Discord or
            Roblox
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
                  disabled={isLoading}
                >
                  <Discord />
                  {isLoading ? 'Redirecting...' : 'Login with Discord'}
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
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Signing in...' : 'Login'}
                </Button>
              </div>
              <div className="text-center text-sm">
                Don&apos;t have an account?{' '}
                <Link to="/register" className="underline underline-offset-4">
                  Sign up
                </Link>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{' '}
        and <a href="#">Privacy Policy</a>.
      </div>
    </div>
  )
}
