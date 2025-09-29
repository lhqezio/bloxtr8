import { createFileRoute, redirect } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/profile')({
  beforeLoad: async ({ location }) => {
    const session = await authClient.getSession()

    if (!session.data) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
          error: '',
        },
      })
    }
  },
  component: Profile,
})

function Profile() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Profile</h1>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Account Information</h2>
        <p className="text-gray-600 dark:text-gray-300">
          Welcome to your profile page! This is where you can manage your
          account settings.
        </p>
      </div>
    </div>
  )
}
