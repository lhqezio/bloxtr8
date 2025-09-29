import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { getApiBaseUrl } from '@/lib/api-base-url'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Roblox } from '@/components/logo/Roblox'

export const Route = createFileRoute('/auth/link/roblox')({
  component: RobloxLinkPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      discordId: (search.discordId as string) || undefined,
    }
  },
})

function RobloxLinkPage() {
  const navigate = useNavigate()
  const { discordId } = useSearch({ from: '/auth/link/roblox' })
  const [status, setStatus] = useState<
    'loading' | 'success' | 'error' | 'linking'
  >('loading')
  const [message, setMessage] = useState('')
  const [isLinking, setIsLinking] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await authClient.getSession()

        if (!session.data?.user && !discordId) {
          setStatus('error')
          setMessage(
            'You must be logged in to link your Roblox account. Please sign in first.',
          )
          return
        }

        // If we have a Discord ID, check if Roblox is already linked
        if (discordId) {
          try {
            const response = await fetch(
              `${getApiBaseUrl()}/api/users/accounts/${discordId}`,
            )
            if (response.ok) {
              const accounts = await response.json()
              const hasRobloxAccount = accounts.some(
                (account: any) => account.providerId === 'roblox',
              )

              if (hasRobloxAccount) {
                setStatus('success')
                setMessage('Your Roblox account is already linked!')
              } else {
                setStatus('linking')
                setMessage('Ready to link your Roblox account')
              }
            } else {
              setStatus('linking')
              setMessage('Ready to link your Roblox account')
            }
          } catch (error) {
            console.error('Error checking Discord user accounts:', error)
            setStatus('linking')
            setMessage('Ready to link your Roblox account')
          }
          return
        }

        // Check if Roblox account is already linked for authenticated users
        // For now, assume not linked and show linking option
        setStatus('linking')
        setMessage('Ready to link your Roblox account')
      } catch (error) {
        console.error('Error checking auth status:', error)
        setStatus('error')
        setMessage('An error occurred while checking your account status.')
      }
    }

    checkAuth()
  }, [discordId])

  const handleLinkRoblox = async () => {
    setIsLinking(true)
    try {
      if (discordId) {
        // For Discord users, get OAuth URL from server
        const redirectUri = `${window.location.origin}/auth/callback`

        try {
          const response = await fetch(
            `${getApiBaseUrl()}/api/users/roblox-oauth-url`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                redirectUri,
                discordId,
              }),
            },
          )

          if (response.ok) {
            const data = await response.json()
            console.log('OAuth URL response:', data)
            window.location.href = data.authUrl
            return
          } else {
            const errorData = await response.json()
            console.error('Failed to get OAuth URL:', errorData)
            throw new Error(
              `Failed to get OAuth URL: ${errorData.message || 'Unknown error'}`,
            )
          }
        } catch (error) {
          console.error('Error getting OAuth URL:', error)
          setStatus('error')
          setMessage('Failed to initialize OAuth flow')
          return
        }
      }

      // For authenticated users, get OAuth URL from server
      const redirectUri = `${window.location.origin}/auth/callback`

      try {
        const response = await fetch(
          `${getApiBaseUrl()}/api/users/roblox-oauth-url`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              redirectUri,
            }),
          },
        )

        if (response.ok) {
          const data = await response.json()
          console.log('OAuth URL response:', data)
          window.location.href = data.authUrl
          return
        } else {
          const errorData = await response.json()
          console.error('Failed to get OAuth URL:', errorData)
          throw new Error(
            `Failed to get OAuth URL: ${errorData.message || 'Unknown error'}`,
          )
        }
      } catch (error) {
        console.error('Error getting OAuth URL:', error)
        setStatus('error')
        setMessage('Failed to initialize OAuth flow')
        return
      }
    } catch (error) {
      console.error('Error linking Roblox account:', error)
      setStatus('error')
      setMessage('An unexpected error occurred while linking your account.')
    } finally {
      setIsLinking(false)
    }
  }

  const handleGoToProfile = () => {
    navigate({ to: '/user' })
  }

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Roblox />
            </div>
            <CardTitle className="text-xl">Link Roblox Account</CardTitle>
            <CardDescription>
              Connect your Roblox account to your Bloxtr8 profile
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === 'loading' && (
              <div className="flex items-center justify-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Checking account status...</span>
              </div>
            )}

            {status === 'linking' && (
              <div className="space-y-4">
                <div className="text-center text-sm text-muted-foreground">
                  {message}
                </div>
                <Button
                  onClick={handleLinkRoblox}
                  className="w-full"
                  disabled={isLinking}
                >
                  {isLinking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Redirecting to Roblox...
                    </>
                  ) : (
                    <>
                      <Roblox />
                      Link Roblox Account
                    </>
                  )}
                </Button>
              </div>
            )}

            {status === 'success' && (
              <div className="space-y-4">
                <div className="flex items-center justify-center space-x-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Success!</span>
                </div>
                <div className="text-center text-sm text-muted-foreground">
                  {message}
                </div>
                <Button onClick={handleGoToProfile} className="w-full">
                  Go to Profile
                </Button>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-4">
                <div className="flex items-center justify-center space-x-2 text-red-600">
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Error</span>
                </div>
                <div className="text-center text-sm text-muted-foreground">
                  {message}
                </div>
                {message.includes('must be logged in') ? (
                  <Button
                    onClick={() => navigate({ to: '/login' })}
                    className="w-full"
                  >
                    Sign In
                  </Button>
                ) : (
                  <Button
                    onClick={handleLinkRoblox}
                    className="w-full"
                    disabled={isLinking}
                  >
                    {isLinking ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Retrying...
                      </>
                    ) : (
                      'Try Again'
                    )}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-xs text-muted-foreground">
          <p>
            By linking your Roblox account, you agree to our{' '}
            <a
              href="#"
              className="underline underline-offset-4 hover:text-primary"
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="#"
              className="underline underline-offset-4 hover:text-primary"
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
