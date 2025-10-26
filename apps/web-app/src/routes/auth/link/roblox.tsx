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
      token: (search.token as string) || undefined,
    }
  },
})

function RobloxLinkPage() {
  const navigate = useNavigate()
  const { token } = useSearch({ from: '/auth/link/roblox' })
  const [status, setStatus] = useState<
    'loading' | 'success' | 'error' | 'linking'
  >('loading')
  const [message, setMessage] = useState('')
  const [isLinking, setIsLinking] = useState(false)
  const [userData, setUserData] = useState<any>(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // If we have a token, validate it
        if (token) {
          try {
            const response = await fetch(
              `${getApiBaseUrl()}/api/users/link-token/${token}`,
            )
            if (response.ok) {
              const tokenData = await response.json()
              setUserData(tokenData.user)

              // Check if Roblox is already linked
              const hasRobloxAccount = tokenData.user.accounts.some(
                (account: any) => account.providerId === 'roblox',
              )

              if (hasRobloxAccount) {
                setStatus('success')
                setMessage('Your Roblox account is already linked!')
              } else {
                setStatus('linking')
                setMessage('Ready to link your Roblox account')
              }
            } else if (response.status === 404) {
              setStatus('error')
              setMessage(
                'Invalid or expired token. Please generate a new link from Discord.',
              )
            } else if (response.status === 410) {
              setStatus('error')
              setMessage(
                'Token has expired or been used. Please generate a new link from Discord.',
              )
            } else {
              setStatus('error')
              setMessage('Failed to validate token. Please try again later.')
            }
          } catch (error) {
            console.error('Error validating token:', error)
            setStatus('error')
            setMessage('An error occurred while validating your token.')
          }
          return
        }

        // No token provided - check if user is logged in via web app
        const session = await authClient.getSession()
        if (!session.data?.user) {
          setStatus('error')
          setMessage(
            'No valid token provided. Please use the Discord bot `/link` command to get a secure link.',
          )
          return
        }

        // For web app users, get Discord account info and check if Roblox is linked
        // Note: We'll need to fetch user accounts separately since they're not in the session
        // For now, we'll handle this in the handleLinkRoblox function
        setStatus('linking')
        setMessage('Ready to link your Roblox account')
      } catch (error) {
        console.error('Error checking auth status:', error)
        setStatus('error')
        setMessage('An error occurred while checking your account status.')
      }
    }

    checkAuth()
  }, [token])

  const handleLinkRoblox = async () => {
    setIsLinking(true)
    try {
      if (token && userData) {
        // For token-based users, get OAuth URL from server
        const redirectUri = `${getApiBaseUrl()}/api/oauth/roblox/callback`

        try {
          const response = await fetch(
            `${getApiBaseUrl()}/api/oauth/roblox/url`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                redirectUri,
                discordId: userData.accounts.find(
                  (acc: any) => acc.providerId === 'discord',
                )?.accountId,
                token, // Include token for validation
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
      const redirectUri = `${getApiBaseUrl()}/api/oauth/roblox/callback`

      // Get Discord account from session
      const session = await authClient.getSession()
      if (!session.data?.user) {
        setStatus('error')
        setMessage('Session expired. Please sign in again.')
        return
      }

      // Fetch user accounts to get Discord ID
      try {
        const userResponse = await fetch(
          `${getApiBaseUrl()}/api/users/${session.data.user.id}`,
        )
        if (!userResponse.ok) {
          setStatus('error')
          setMessage('Failed to fetch user information.')
          return
        }

        const fetchedUserData = await userResponse.json()
        const discordAcc = fetchedUserData.accounts?.find(
          (account: any) => account.providerId === 'discord',
        )

        if (!discordAcc) {
          setStatus('error')
          setMessage(
            'No Discord account found. Please sign in with Discord first.',
          )
          return
        }

        const response = await fetch(
          `${getApiBaseUrl()}/api/oauth/roblox/url`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              redirectUri,
              discordId: discordAcc.accountId,
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
              {token
                ? 'Connect your Roblox account to complete your Discord setup'
                : 'Connect your Roblox account to your Bloxtr8 profile'}
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
                  {token ? 'Return to Discord' : 'Go to Profile'}
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
                    onClick={() =>
                      navigate({
                        to: '/login',
                        search: { redirect: '', error: '' },
                      })
                    }
                    className="w-full"
                  >
                    Sign In
                  </Button>
                ) : message.includes('Discord user not found') ? (
                  <div className="space-y-2">
                    <Button
                      onClick={() =>
                        navigate({
                          to: '/login',
                          search: { redirect: '', error: '' },
                        })
                      }
                      className="w-full"
                    >
                      Sign Up with Discord
                    </Button>
                    <div className="text-xs text-muted-foreground text-center">
                      Or use the Discord bot: <code>/signup</code>
                    </div>
                  </div>
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
