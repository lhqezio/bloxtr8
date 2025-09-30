import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/auth/link/')({
  component: LinkIndexPage,
})

function LinkIndexPage() {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Account Linking</h1>
          <p className="text-muted-foreground mt-2">
            Choose an account to link to your Bloxtr8 profile
          </p>
        </div>

        <div className="space-y-4">
          <a
            href="/auth/link/roblox"
            className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-[#00A2FF] rounded flex items-center justify-center">
                <span className="text-white font-bold text-sm">R</span>
              </div>
              <div>
                <h3 className="font-medium">Link Roblox Account</h3>
                <p className="text-sm text-muted-foreground">
                  Connect your Roblox account for verification
                </p>
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  )
}
