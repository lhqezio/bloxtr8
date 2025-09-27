import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getApiBaseUrl } from '@/lib/api-base-url'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallbackPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      code: (search.code as string) || undefined,
      state: (search.state as string) || undefined,
      error: (search.error as string) || undefined,
      discordId: (search.discordId as string) || undefined,
    }
  },
})

function AuthCallbackPage() {
  const navigate = useNavigate()
  const { code, state, error, discordId } = useSearch({
    from: '/auth/callback',
  })
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading',
  )
  const [message, setMessage] = useState('')

  useEffect(() => {
    const handleCallback = async () => {
      try {
        if (error) {
          setStatus('error')
          setMessage(`Authentication failed: ${error}`)
          return
        }

        if (!code) {
          setStatus('error')
          setMessage('No authorization code received')
          return
        }

        // If we have a Discord ID, this is a Discord user linking Roblox
        if (discordId) {
          // Validate state parameter for CSRF protection
          if (!state || !state.startsWith(`discord_${discordId}_`)) {
            setStatus('error')
            setMessage('Invalid state parameter. Please try again.')
            return
          }

          try {
            // In a real implementation, you would:
            // 1. Exchange the code for an access token
            // 2. Use the access token to get user info from Roblox
            // 3. Extract the Roblox user ID
            // 4. Call the API to link the accounts

            // Get the current URL to use as redirect URI
            const redirectUri = `${window.location.origin}/auth/callback?discordId=${discordId}`

            const response = await fetch(
              `${getApiBaseUrl()}/api/users/link-roblox-discord`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  discordId,
                  oauthCode: code,
                  state,
                  redirectUri,
                }),
              },
            )

            if (response.ok) {
              setStatus('success')
              setMessage('Roblox account linked successfully!')

              // Redirect to success page after 3 seconds
              setTimeout(() => {
                navigate({ to: '/auth/link/roblox', search: { discordId } })
              }, 3000)
            } else {
              const errorData = await response.json()
              console.error('API Error:', errorData)
              setStatus('error')
              setMessage(
                `Failed to link account: ${errorData.message || 'Unknown error'}`,
              )
            }
          } catch (linkError) {
            console.error('Error linking Roblox account:', linkError)
            setStatus('error')
            setMessage(
              `An error occurred while linking your account: ${linkError instanceof Error ? linkError.message : 'Unknown error'}`,
            )
          }
        } else {
          // Regular OAuth callback for authenticated users
          setStatus('success')
          setMessage('Authentication successful!')

          // Redirect to user profile
          setTimeout(() => {
            navigate({ to: '/user' })
          }, 2000)
        }
      } catch (callbackError) {
        console.error('Error handling OAuth callback:', callbackError)
        setStatus('error')
        setMessage('An unexpected error occurred')
      }
    }

    handleCallback()
  }, [code, state, error, discordId, navigate])

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Processing Authentication</CardTitle>
            <CardDescription>
              Please wait while we complete your account linking
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === 'loading' && (
              <div className="flex items-center justify-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing...</span>
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
                <div className="text-center text-xs text-muted-foreground">
                  Redirecting you back...
                </div>
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
