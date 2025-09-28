import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Discord } from '@/components/logo/Discord'
import { Roblox } from '@/components/logo/Roblox'

type ProfileParam = {
  error?: string
}
export const Route = createFileRoute('/_authenticated/me')({
  validateSearch: (search: Record<string, unknown>): ProfileParam => ({
    error: search.error as string,
  }),
  component: UserProfile,
  loader: async () => {
    const accounts = await authClient.listAccounts()
    return accounts
  },
})

function UserProfile() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const { error: linkError } = Route.useSearch()
  const accounts = Route.useLoaderData().data
  const discordLinked = accounts?.some(
    (acc: any) => acc.providerId === 'discord',
  )
  const robloxLinked = accounts?.some((acc: any) => acc.providerId === 'roblox')
  console.log(discordLinked)
  const { data: session } = authClient.useSession()
  async function handleSocial(provider: 'discord' | 'roblox') {
    const { error } = await authClient.linkSocial(
      { provider, callbackURL: '/me', errorCallbackURL: '/me' },
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
      console.error(error.message)
    }
  }
  async function handleUnlink(providerId: 'discord' | 'roblox') {
    const { error } = await authClient.unlinkAccount(
      {
        providerId,
      },
      {
        onRequest: () => {
          setIsLoading(true)
        },
        onSuccess: () => {
          setIsLoading(false)
          router.invalidate()
        },
        onError: () => {
          setIsLoading(false)
        },
      },
    )
    if (error) {
      toast.error(error.message)
    }
  }
  return (
    <div>
      <p>Hello {session?.user.name}</p>
      <div className="flex flex-col gap-4">
        <Button
          variant={discordLinked ? 'destructive' : 'outline'}
          className="w-full"
          type="button"
          onClick={() =>
            discordLinked ? handleUnlink('discord') : handleSocial('discord')
          }
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
          variant={robloxLinked ? 'destructive' : 'outline'}
          className="w-full"
          type="button"
          onClick={() =>
            robloxLinked ? handleUnlink('roblox') : handleSocial('roblox')
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
        {linkError === 'account_already_linked_to_different_user' && (
          <p className="text-center text-sm text-red-600">
            This social account is already linked to another Bloxtr8 account
          </p>
        )}
        {linkError &&
          linkError !== 'account_already_linked_to_different_user' && (
            <p className="text-center text-sm text-red-600">
              An unknown error occurred during sign-in.
            </p>
          )}
      </div>
    </div>
  )
}
