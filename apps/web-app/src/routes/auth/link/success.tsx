import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const Route = createFileRoute('/auth/link/success')({
  component: LinkSuccessPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      message: (search.message as string) || 'Account linked successfully!',
      discordId: (search.discordId as string) || undefined,
    }
  },
})

function LinkSuccessPage() {
  const navigate = useNavigate()
  const { message, discordId } = useSearch({ from: '/auth/link/success' })
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Auto-close the window/tab
          window.close()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const handleReturnToDiscord = () => {
    window.close()
  }

  const handleGoToProfile = () => {
    navigate({ to: '/profile' })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-green-100 p-3">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-2xl text-green-700">Success!</CardTitle>
          <CardDescription className="text-base">{message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              This window will automatically close in {countdown} seconds.
            </p>

            <div className="flex flex-col space-y-2">
              {discordId ? (
                <Button onClick={handleReturnToDiscord} className="w-full">
                  Return to Discord
                </Button>
              ) : (
                <Button onClick={handleGoToProfile} className="w-full">
                  Go to Profile
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
