import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Discord } from '@/components/logo/Discord'
import { Roblox } from '@/components/logo/Roblox'

export const Route = createFileRoute('/_authenticated/me')({
  component: UserProfile,
  loader: async () => {
      const accounts = await authClient.listAccounts();
      return accounts;    
  }
})

function UserProfile() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false)
  const accounts = Route.useLoaderData().data;
  const discordLinked = accounts?.some(
    (acc: any) => acc.providerId === 'discord'
  )
  const robloxLinked = accounts?.some(
    (acc: any) => acc.providerId === 'roblox'
  )
  console.log(discordLinked);
  const { data: session } = authClient.useSession()
  async function handleSocial(provider: 'discord' | 'roblox') {
    const { error } = await authClient.linkSocial(
      { provider, callbackURL: '/me' },
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
  async function handleUnlink(providerId: 'discord' | 'roblox', ){
    const { error } = await authClient.unlinkAccount({
      providerId
    },
    {
      onRequest: () => {
        setIsLoading(true)
      },
      onSuccess: () => {
        setIsLoading(false)
        router.invalidate()
      },
      onError: () =>{
        setIsLoading(false);
      }

    }
  )
  }
  return (
    <div>
      <p>Hello {session?.user.name}</p>
      <div className="flex flex-col gap-4">
        <Button
  variant={discordLinked ? "destructive" : "outline"}
          className="w-full"
          type="button"
          onClick={() => 
            discordLinked
            ? handleUnlink('discord')
            : handleSocial('discord')}
          disabled={isLoading}
        >
          <Discord />
            {isLoading
            ? discordLinked
              ? 'Unlinking...'
              : 'Redirecting...'
            : discordLinked
            ? 'Unlink Discord'
            : 'Link account with Discord'}        
        </Button>
        <Button
  variant={robloxLinked ? "destructive" : "outline"}
          className="w-full"
          type="button"
          onClick={() =>
            robloxLinked
              ? handleUnlink('roblox')
              : handleSocial('roblox')
          }
          disabled={isLoading}
        >
          <Roblox />
            {isLoading
            ? robloxLinked
              ? 'Unlinking...'
              : 'Redirecting...'
            : robloxLinked
            ? 'Unlink Roblox'
            : 'Link account with Roblox'}        
        </Button>
      </div>
    </div>
  )
}
