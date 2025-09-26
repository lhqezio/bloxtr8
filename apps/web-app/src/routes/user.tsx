import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Discord } from '@/components/logo/Discord'
import { Roblox } from '@/components/logo/Roblox'

export const Route = createFileRoute('/user')({
  component: User,
})

function User() {
  const [isLoading, setIsLoading] = useState(false)

  async function handleSocial(provider: 'discord' | 'roblox') {
    const { error } = await authClient.linkSocial(
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
  const { data: session, isPending, error, refetch } = authClient.useSession()
  if (isPending) return <p>Loading...</p>
  if (!session) return <p>Not logged in</p>
  return (
    <div>
      <p>Hello {session.user.name}</p>
      <div className="flex flex-col gap-4">
        <Button
          variant="outline"
          className="w-full"
          type="button"
          onClick={() => handleSocial('discord')}
          disabled={isLoading}
        >
          <Discord />
          {isLoading ? 'Redirecting...' : 'Link account with Discord'}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          type="button"
          onClick={() => handleSocial('roblox')}
          disabled={isLoading}
        >
          <Roblox />
          {isLoading ? 'Redirecting...' : 'Link account Roblox'}
        </Button>
      </div>
    </div>
  )
}
