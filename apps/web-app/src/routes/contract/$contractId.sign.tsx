import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import {
  validateSignToken,
  fetchContract,
  signContractWeb,
  getContractPdfUrl,
} from '../../lib/contractAuth';

export const Route = createFileRoute('/contract/$contractId/sign')({
  component: ContractSignPage,
});

function ContractSignPage() {
  const { contractId } = Route.useParams();
  const search = useSearch({ from: '/contract/$contractId/sign' });
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const token = (search as any)?.token;
        
        if (!token) {
          setError('No authentication token provided');
          setLoading(false);
          return;
        }

        // Validate token
        const authResult = await validateSignToken(token);
        
        if (!authResult.success) {
          setError(authResult.error || 'Invalid or expired link');
          setLoading(false);
          return;
        }

        setUserId(authResult.userId || null);

        // Fetch contract details
        const contractData = await fetchContract(contractId);
        setContract(contractData);

        // Get PDF URL
        const url = await getContractPdfUrl(contractId);
        setPdfUrl(url);

        setLoading(false);
      } catch (err) {
        console.error('Initialization error:', err);
        setError('Failed to load contract');
        setLoading(false);
      }
    }

    init();
  }, [contractId, search]);

  const handleSign = async () => {
    if (!userId || !agreed) return;

    setSigning(true);
    try {
      const token = (search as any)?.token;
      const result = await signContractWeb(contractId, userId, token);

      if (result.success) {
        navigate({ to: `/contract/${contractId}/complete` });
      } else {
        setError(result.error || 'Failed to sign contract');
      }
    } catch (err) {
      setError('An error occurred while signing');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Loading Contract...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-2xl border-red-500">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => window.close()}>Close</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!contract) {
    return null;
  }

  const role =
    contract.offer.buyerId === userId ? 'buyer' : 'seller';
  const counterparty =
    role === 'buyer' ? contract.offer.seller : contract.offer.buyer;
  const alreadySigned = contract.signatures?.some(
    (sig: any) => sig.userId === userId
  );

  if (alreadySigned) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-2xl border-green-500">
          <CardHeader>
            <CardTitle className="text-green-600">Already Signed</CardTitle>
            <CardDescription>
              You have already signed this contract.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => window.close()}>Close</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Contract Signature Required</CardTitle>
          <CardDescription>
            Please review the contract carefully before signing
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Contract Summary */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Asset
              </p>
              <p className="text-lg font-semibold">
                {contract.offer.listing.title}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Price
              </p>
              <p className="text-lg font-semibold">
                ${(Number(contract.offer.amount) / 100).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Your Role
              </p>
              <p className="text-lg font-semibold capitalize">{role}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {role === 'buyer' ? 'Seller' : 'Buyer'}
              </p>
              <p className="text-lg font-semibold">
                {counterparty.name || counterparty.email}
              </p>
            </div>
          </div>

          {/* PDF Viewer */}
          {pdfUrl && (
            <div className="border rounded-lg overflow-hidden">
              <iframe
                src={pdfUrl}
                className="w-full h-[600px]"
                title="Contract PDF"
              />
            </div>
          )}

          {/* Download PDF Button */}
          {pdfUrl && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => window.open(pdfUrl, '_blank')}
              >
                📥 Download Full Contract
              </Button>
            </div>
          )}

          {/* Agreement Checkbox */}
          <div className="flex items-start space-x-3 p-4 border rounded-lg">
            <Checkbox
              id="agree"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
            />
            <label
              htmlFor="agree"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              I have read and understood the contract terms and agree to be
              legally bound by this digital signature. I understand that this
              signature has the same legal effect as a handwritten signature.
            </label>
          </div>

          {/* Warning */}
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ <strong>Important:</strong> By signing this contract, you are
              entering into a legally binding agreement. Please ensure you
              understand all terms before proceeding.
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => window.close()}>
            Cancel
          </Button>
          <Button
            onClick={handleSign}
            disabled={!agreed || signing}
            className="bg-green-600 hover:bg-green-700"
          >
            {signing ? 'Signing...' : '✍️ Sign Contract'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}



