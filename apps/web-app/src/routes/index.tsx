import { toast } from 'sonner'
import { createFileRoute } from '@tanstack/react-router'
import logo from '../logo.svg'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  component: App,
})
function App() {
  return (
    <div className="text-center">
      <header className="min-h-screen flex flex-col items-center justify-center bg-background text-primary-foreground text-[calc(10px+2vmin)]">
        <Button onClick={() => toast('hello')}>Click me</Button>
        <img
          src={logo}
          className="h-[40vmin] pointer-events-none animate-[spin_20s_linear_infinite]"
          alt="logo"
        />
        <p>
          Edit <code>src/routes/index.tsx</code> and save to reload.
        </p>
        <a
          className="text-[#61dafb]` hover:underline"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
        <a
          className="text-[#61dafb] hover:underline"
          href="https://tanstack.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn TanStack
        </a>
      </header>
    </div>
  )
}
