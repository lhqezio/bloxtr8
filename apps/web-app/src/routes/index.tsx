import { toast } from 'sonner'
import { createFileRoute } from '@tanstack/react-router'
import logo from '../logo.svg'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  component: App,
})
function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <main className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center space-y-8 max-w-4xl mx-auto">
          {/* Logo */}
          <div className="flex justify-center">
            <img
              src={logo}
              className="h-24 w-24 pointer-events-none"
              alt="Bloxtr8 Logo"
            />
          </div>

          {/* Main Heading */}
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold text-foreground">
              Secure high-value trades in{' '}
              <span className="text-primary">Roblox</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Trusted escrow service integrated directly into Discord. We verify
              sellers, secure payments, and protect your community.
            </p>
          </div>

          {/* CTA Button */}
          <div className="pt-4">
            <Button
              size="lg"
              className="text-lg px-8 py-6 rounded-xl"
              onClick={() => toast('Protect your trades')}
            >
              Protect Your Trades
            </Button>
          </div>

          {/* Trust Indicators */}
          <div className="pt-12 space-y-6">
            <div className="flex flex-wrap justify-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>All trades protected by escrow</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Real-time verification</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>Discord integration</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
