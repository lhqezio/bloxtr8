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

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallbackPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      code: (search.code as string) || undefined,
      state: (search.state as string) || undefined,
      error: (search.error as string) || undefined,
      discordId: (search.discordId as string) || undefined,
      success: (search.success as string) || undefined,
      message: (search.message as string) || undefined,
    }
  },
})

function AuthCallbackPage() {
  const navigate = useNavigate()
  const {
    code,
    state,
    error,
    discordId,
    success,
    message: urlMessage,
  } = useSearch({
    from: '/auth/callback',
  })
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading',
  )
  const [message, setMessage] = useState('')

  useEffect(() => {
    const handleCallback = () => {
      try {
        if (error) {
          setStatus('error')
          let errorMessage = `Authentication failed: ${error}`

          // Handle specific error types with better messages
          if (error === 'oauth_code_used') {
            errorMessage =
              'OAuth code has already been used. Please try linking your account again.'
          } else if (error === 'user_not_found') {
            errorMessage =
              'Discord user not found. Please ensure you are logged in with Discord first.'
          } else if (error === 'account_conflict') {
            errorMessage = 'Roblox account is already linked to another user.'
          } else if (error === 'oauth_validation_failed') {
            errorMessage = 'Failed to validate OAuth code. Please try again.'
          } else if (error === 'callback_error') {
            errorMessage =
              'An error occurred while processing the authentication.'
          } else if (error === 'user_creation_failed') {
            errorMessage = 'Failed to create user account. Please try again.'
          }

          setMessage(errorMessage)
          return
        }

        if (success) {
          setStatus('success')
          setMessage(urlMessage || 'Account linked successfully!')

          // Redirect to success page after 3 seconds
          setTimeout(() => {
            navigate({
              to: '/auth/link/roblox',
              search: { discordId },
            })
          }, 3000)
          return
        }

        // All OAuth processing is now handled in the API callback
        // This web app callback just displays the result
        if (!success && !error) {
          setStatus('error')
          setMessage('No authorization result received')
          return
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
