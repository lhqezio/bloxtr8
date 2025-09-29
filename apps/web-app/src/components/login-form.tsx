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
import { Discord } from '@/components/logo/Discord'

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleDiscordLogin() {
    const { error } = await authClient.signIn.social(
      { provider: 'discord', callbackURL: '/profile' },
      {
        onRequest: () => {
          setIsLoading(true)
        },
        onSuccess: () => {
          setIsLoading(false)
          toast.success('Successfully signed in with Discord!')
        },
        onError: (ctx) => {
          setIsLoading(false)
          toast.error(ctx.error.message || 'Failed to sign in with Discord')
        },
      },
    )
    if (error) {
      console.error(error.statusText)
      toast.error('Authentication failed. Please try again.')
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome to Bloxtr8</CardTitle>
          <CardDescription>
            Sign in with Discord to access your account. If you don't have an
            account, we'll create one for you automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            <Button
              variant="outline"
              className="w-full"
              type="button"
              onClick={handleDiscordLogin}
              disabled={isLoading}
            >
              <Discord />
              {isLoading ? 'Redirecting...' : 'Sign in with Discord'}
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{' '}
        and <a href="#">Privacy Policy</a>.
      </div>
    </div>
  )
}
