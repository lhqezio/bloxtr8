import { createFileRoute } from '@tanstack/react-router';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';

export const Route = createFileRoute('/contract/$contractId/complete')({
  component: ContractCompletePage,
});

function ContractCompletePage() {
  const { contractId } = Route.useParams();

  return (
    <div className="container mx-auto py-8 flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-2xl border-green-500">
        <CardHeader>
          <CardTitle className="text-green-600 text-2xl">
            ✅ Contract Signed Successfully
          </CardTitle>
          <CardDescription>
            Your digital signature has been recorded and the contract is now
            legally binding.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm text-green-800 dark:text-green-200">
              <strong>What happens next?</strong>
            </p>
            <ul className="mt-2 space-y-1 text-sm text-green-700 dark:text-green-300">
              <li>• You will receive a confirmation via Discord</li>
              <li>• The other party will be notified to sign</li>
              <li>
                • Once both parties sign, escrow will be automatically created
              </li>
              <li>• You can track progress in Discord</li>
            </ul>
          </div>

          <div className="p-4 border rounded-lg">
            <p className="text-sm font-medium text-muted-foreground">
              Contract ID
            </p>
            <p className="font-mono text-sm mt-1">{contractId}</p>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              You can safely close this window and return to Discord.
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => window.close()}>
            Close Window
          </Button>
          <Button onClick={() => window.open('https://discord.com', '_blank')}>
            Return to Discord
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}



