import { GalleryVerticalEnd } from 'lucide-react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'

interface SignupFormProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export function SignupForm({ className, ...props }: SignupFormProps) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { id, value } = e.target
    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsLoading(true)
    setError(null)

    // use Better Auth's recommended destructuring
    const { data, error } = await authClient.signUp.email(
      {
        email: formData.email,
        password: formData.password,
        name: formData.username,
        callbackURL: '/user', // optional: redirect after verification/sign in
      },
      {
        onRequest: () => {
          // could set loading state here too
          setIsLoading(true)
        },
        onSuccess: () => {
          // auto-redirect, or update UI
          window.location.href = '/user'
        },
        onError: (ctx) => {
          setError(ctx.error.message)
        },
      },
    )

    if (error) {
      console.error('Error signing up:', error.message)
    }

    setIsLoading(false)
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2">
            <Link
              to="/"
              className="flex flex-col items-center gap-2 font-medium"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md">
                <GalleryVerticalEnd className="size-6" />
              </div>
              <span className="sr-only">Minh Inc.</span>
            </Link>
            <h1 className="text-xl font-bold">Create your account</h1>
            <div className="text-center text-sm">
              Already have an account?{' '}
              <Link to="/login" className="underline underline-offset-4">
                Log in
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                onChange={handleChange}
                value={formData.username}
                type="text"
                placeholder="minh"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                onChange={handleChange}
                value={formData.email}
                type="email"
                placeholder="m@example.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                onChange={handleChange}
                value={formData.password}
                type="password"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                onChange={handleChange}
                value={formData.confirmPassword}
                type="password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Creating account...' : 'Sign Up'}
            </Button>
            {error ? (
              <div className="text-destructive text-sm" role="alert">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </form>
      <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary">
        By signing up, you agree to our <a href="#">Terms of Service</a> and{' '}
        <a href="#">Privacy Policy</a>.
      </div>
    </div>
  )
}
