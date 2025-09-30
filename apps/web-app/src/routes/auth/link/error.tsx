import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const Route = createFileRoute('/auth/link/error')({
  component: LinkErrorPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      error: (search.error as string) || 'unknown_error',
      message:
        (search.message as string) ||
        'An error occurred during account linking',
      discordId: (search.discordId as string) || undefined,
    }
  },
})

function LinkErrorPage() {
  const navigate = useNavigate()
  const { error, message, discordId } = useSearch({ from: '/auth/link/error' })

  const handleReturnToDiscord = () => {
    window.close()
  }

  const handleTryAgain = () => {
    if (discordId) {
      // Redirect back to Discord to get a new link
      window.close()
    } else {
      // For web app users, go to profile or login
      navigate({ to: '/profile' })
    }
  }

  const getErrorTitle = (errorType: string) => {
    switch (errorType) {
      case 'oauth_code_used':
        return 'Authorization Code Used'
      case 'account_conflict':
        return 'Account Already Linked'
      case 'user_not_signed_up':
        return 'User Not Signed Up'
      case 'user_creation_failed':
        return 'Account Creation Failed'
      case 'oauth_validation_failed':
        return 'Authentication Failed'
      case 'missing_parameters':
        return 'Missing Information'
      case 'invalid_state':
        return 'Invalid Request'
      default:
        return 'Linking Error'
    }
  }

  const getErrorDescription = (errorType: string) => {
    switch (errorType) {
      case 'oauth_code_used':
        return 'This authorization code has already been used. Please generate a new link from Discord.'
      case 'account_conflict':
        return 'This Roblox account is already linked to another user.'
      case 'user_not_signed_up':
        return 'You must sign up first before linking your Roblox account.'
      case 'user_creation_failed':
        return "We couldn't create your account. Please try again."
      case 'oauth_validation_failed':
        return "We couldn't verify your Roblox account. Please try again."
      case 'missing_parameters':
        return 'Some required information is missing from the request.'
      case 'invalid_state':
        return 'The request state is invalid or corrupted.'
      default:
        return message
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-red-100 p-3">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </div>
          <CardTitle className="text-2xl text-red-700">
            {getErrorTitle(error)}
          </CardTitle>
          <CardDescription className="text-base">
            {getErrorDescription(error)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {error === 'oauth_code_used' && (
              <div className="text-sm text-muted-foreground bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                <p className="font-medium text-yellow-800 mb-1">
                  How to fix this:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-yellow-700">
                  <li>Go back to Discord</li>
                  <li>
                    Use the <code>/link</code> command again
                  </li>
                  <li>Click the new link that gets generated</li>
                </ol>
              </div>
            )}

            {error === 'account_conflict' && (
              <div className="text-sm text-muted-foreground bg-blue-50 p-3 rounded-lg border border-blue-200">
                <p className="font-medium text-blue-800 mb-1">
                  What this means:
                </p>
                <p className="text-blue-700">
                  This Roblox account is already connected to another Discord
                  account. Each Roblox account can only be linked to one Discord
                  account.
                </p>
              </div>
            )}

            {error === 'user_not_signed_up' && (
              <div className="text-sm text-muted-foreground bg-orange-50 p-3 rounded-lg border border-orange-200">
                <p className="font-medium text-orange-800 mb-1">
                  How to fix this:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-orange-700">
                  <li>Go to Discord</li>
                  <li>
                    Use the <code>/signup</code> command in our bot
                  </li>
                  <li>Or sign up via Discord OAuth on this website</li>
                  <li>Then try linking your Roblox account again</li>
                </ol>
              </div>
            )}

            <div className="flex flex-col space-y-2">
              <Button onClick={handleTryAgain} className="w-full">
                {error === 'oauth_code_used' ? 'Get New Link' : 'Try Again'}
              </Button>

              {discordId && (
                <Button
                  variant="outline"
                  onClick={handleReturnToDiscord}
                  className="w-full"
                >
                  Return to Discord
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => window.close()}
                className="w-full"
              >
                Close Window
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
