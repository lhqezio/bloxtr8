import { createFileRoute } from '@tanstack/react-router'
import { authClient } from "@/lib/auth-client"


export const Route = createFileRoute('/user')({
  component: User,
})

function User() {
    const {
    data: session,
    isPending,
    error,
    refetch
  } = authClient.useSession()
   if (isPending) return <p>Loading...</p>
if (!session) return <p>Not logged in</p>
  return <p>Hello {session.user.name}</p>
}
