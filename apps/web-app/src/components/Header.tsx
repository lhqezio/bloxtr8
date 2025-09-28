import { Link, useNavigate } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

export default function Header() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  async function handleLogout() {
    await logout()
  }
  function handleLogin() {
    navigate({ to: '/login', search: { redirect: window.location.pathname } })
  }
  const { data: session } = authClient.useSession()
  return (
    <header className="p-2 flex gap-2 bg-white text-black justify-between items-center">
      <nav className="flex flex-row">
        <div className="px-2 font-bold">
          <Link to="/">Home</Link>
        </div>
      </nav>
      <div>
        <Button onClick={session ? handleLogout : handleLogin}>
          {session ? 'Logout' : 'Login'}
        </Button>
      </div>
    </header>
  )
}
