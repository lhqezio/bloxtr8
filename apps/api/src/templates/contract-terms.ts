/**
 * Contract terms templates for Roblox asset sales
 * Versioned for legal compliance
 */

export interface ContractData {
  // Contract metadata
  contractId: string;
  templateVersion: string;
  createdAt: Date;

  // Parties
  seller: {
    id: string;
    name: string;
    email: string;
    kycTier: string;
    robloxAccountId?: string;
  };
  buyer: {
    id: string;
    name: string;
    email: string;
    kycTier: string;
    robloxAccountId?: string;
  };

  // Asset details
  asset: {
    listingId: string;
    title: string;
    description: string;
    category: string;
    robloxData?: {
      gameId: string;
      gameName: string;
      gameDescription?: string;
      thumbnailUrl?: string;
      playerCount?: number;
      visits?: number;
      verifiedOwnership: boolean;
      ownershipType: string;
      verificationDate?: Date;
    };
  };

  // Financial terms
  financial: {
    amount: string; // in cents
    currency: string;
    amountDisplay: string; // formatted display (e.g., "$1,000.00")
  };

  // Offer details
  offer: {
    id: string;
    conditions?: string;
    acceptedAt: Date;
  };
}

export interface ContractTemplate {
  version: string;
  name: string;
  generateContent: (data: ContractData) => string[];
}

/**
 * Version 1.0.0 - Initial Roblox Asset Sale Agreement
 */
export const CONTRACT_TEMPLATE_V1: ContractTemplate = {
  version: '1.0.0',
  name: 'Roblox Asset Sale Agreement',
  
  generateContent: (data: ContractData): string[] => {
    const sections: string[] = [];

    // Header
    sections.push('ROBLOX ASSET SALE AGREEMENT');
    sections.push('');
    sections.push(`Contract ID: ${data.contractId}`);
    sections.push(`Date: ${data.createdAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    sections.push(`Version: ${data.templateVersion}`);
    sections.push('');
    sections.push('---');
    sections.push('');

    // Parties
    sections.push('1. PARTIES');
    sections.push('');
    sections.push('This Agreement is entered into between:');
    sections.push('');
    sections.push('SELLER:');
    sections.push(`  Name: ${data.seller.name || 'User ' + data.seller.id}`);
    sections.push(`  Email: ${data.seller.email}`);
    sections.push(`  Platform ID: ${data.seller.id}`);
    sections.push(`  KYC Status: ${data.seller.kycTier}`);
    if (data.seller.robloxAccountId) {
      sections.push(`  Roblox Account: ${data.seller.robloxAccountId}`);
    }
    sections.push('');
    sections.push('BUYER:');
    sections.push(`  Name: ${data.buyer.name || 'User ' + data.buyer.id}`);
    sections.push(`  Email: ${data.buyer.email}`);
    sections.push(`  Platform ID: ${data.buyer.id}`);
    sections.push(`  KYC Status: ${data.buyer.kycTier}`);
    if (data.buyer.robloxAccountId) {
      sections.push(`  Roblox Account: ${data.buyer.robloxAccountId}`);
    }
    sections.push('');

    // Asset Description
    sections.push('2. ASSET DESCRIPTION');
    sections.push('');
    sections.push(`Title: ${data.asset.title}`);
    sections.push(`Category: ${data.asset.category}`);
    sections.push(`Listing ID: ${data.asset.listingId}`);
    sections.push('');
    sections.push(`Description: ${data.asset.description}`);
    sections.push('');

    // Roblox-specific details
    if (data.asset.robloxData) {
      sections.push('ROBLOX ASSET DETAILS:');
      sections.push(`  Game ID: ${data.asset.robloxData.gameId}`);
      sections.push(`  Game Name: ${data.asset.robloxData.gameName}`);
      if (data.asset.robloxData.gameDescription) {
        sections.push(`  Game Description: ${data.asset.robloxData.gameDescription}`);
      }
      if (data.asset.robloxData.playerCount !== undefined) {
        sections.push(`  Current Players: ${data.asset.robloxData.playerCount.toLocaleString()}`);
      }
      if (data.asset.robloxData.visits !== undefined) {
        sections.push(`  Total Visits: ${data.asset.robloxData.visits.toLocaleString()}`);
      }
      sections.push(`  Ownership Verified: ${data.asset.robloxData.verifiedOwnership ? 'YES' : 'NO'}`);
      sections.push(`  Ownership Type: ${data.asset.robloxData.ownershipType}`);
      if (data.asset.robloxData.verificationDate) {
        sections.push(`  Verification Date: ${data.asset.robloxData.verificationDate.toLocaleDateString()}`);
      }
      sections.push('');
    }

    // Purchase Price
    sections.push('3. PURCHASE PRICE');
    sections.push('');
    sections.push(`The total purchase price for the Asset is: ${data.financial.amountDisplay} ${data.financial.currency}`);
    sections.push('');
    sections.push('Payment shall be held in escrow through the Bloxtr8 platform until successful delivery and confirmation.');
    sections.push('');

    // Offer Conditions
    if (data.offer.conditions) {
      sections.push('4. ADDITIONAL TERMS AND CONDITIONS');
      sections.push('');
      sections.push(data.offer.conditions);
      sections.push('');
    }

    // Representations and Warranties
    const warrantySection = data.offer.conditions ? 5 : 4;
    sections.push(`${warrantySection}. SELLER'S REPRESENTATIONS AND WARRANTIES`);
    sections.push('');
    sections.push('Seller represents and warrants that:');
    sections.push('');
    sections.push('a) Seller is the lawful owner of the Asset or has the legal authority to sell the Asset;');
    sections.push('');
    sections.push('b) The Asset is free from any liens, encumbrances, or claims by third parties;');
    sections.push('');
    sections.push('c) Seller has full power and authority to enter into this Agreement and transfer the Asset;');
    sections.push('');
    sections.push('d) All information provided about the Asset is accurate and complete to the best of Seller\'s knowledge;');
    sections.push('');
    sections.push('e) The Asset complies with all applicable Roblox Terms of Service and Community Standards;');
    sections.push('');
    sections.push('f) Seller has not violated any Roblox policies or agreements in connection with the Asset.');
    sections.push('');

    // Transfer Obligations
    const transferSection = warrantySection + 1;
    sections.push(`${transferSection}. TRANSFER OBLIGATIONS`);
    sections.push('');
    sections.push('Upon execution of this Agreement and receipt of payment in escrow:');
    sections.push('');
    sections.push('a) Seller shall transfer full ownership and control of the Asset to Buyer through appropriate Roblox mechanisms;');
    sections.push('');
    sections.push('b) Seller shall provide all necessary credentials, access codes, or transfer methods as required;');
    sections.push('');
    sections.push('c) Seller shall cooperate with Buyer to verify successful transfer of the Asset;');
    sections.push('');
    sections.push('d) Upon confirmation of successful transfer, funds held in escrow shall be released to Seller;');
    sections.push('');
    sections.push('e) Seller shall provide reasonable post-transfer support for a period of 7 days to address technical issues.');
    sections.push('');

    // Buyer Obligations
    const buyerSection = transferSection + 1;
    sections.push(`${buyerSection}. BUYER'S OBLIGATIONS`);
    sections.push('');
    sections.push('Buyer agrees to:');
    sections.push('');
    sections.push('a) Fund the escrow account with the full purchase price within 48 hours of contract execution;');
    sections.push('');
    sections.push('b) Confirm receipt and successful transfer of the Asset within 72 hours of delivery;');
    sections.push('');
    sections.push('c) Cooperate with Seller during the transfer process;');
    sections.push('');
    sections.push('d) Comply with all Roblox Terms of Service after taking ownership of the Asset.');
    sections.push('');

    // Escrow Terms
    const escrowSection = buyerSection + 1;
    sections.push(`${escrowSection}. ESCROW TERMS`);
    sections.push('');
    sections.push('a) All funds shall be held in a secure escrow account managed by Bloxtr8 or its designated payment processor;');
    sections.push('');
    sections.push('b) Funds shall be released to Seller only upon Buyer\'s confirmation of successful asset transfer;');
    sections.push('');
    sections.push('c) If Buyer does not confirm or dispute within 72 hours of delivery, funds may be automatically released;');
    sections.push('');
    sections.push('d) In case of dispute, funds shall remain in escrow pending resolution through the dispute process.');
    sections.push('');

    // Dispute Resolution
    const disputeSection = escrowSection + 1;
    sections.push(`${disputeSection}. DISPUTE RESOLUTION`);
    sections.push('');
    sections.push('a) Any disputes arising from this Agreement shall be resolved through the Bloxtr8 dispute resolution process;');
    sections.push('');
    sections.push('b) Both parties agree to provide all requested documentation and evidence in good faith;');
    sections.push('');
    sections.push('c) The decision of the Bloxtr8 dispute resolution team shall be final and binding;');
    sections.push('');
    sections.push('d) For disputes involving amounts over $10,000 USD, parties may request external arbitration.');
    sections.push('');

    // Limitation of Liability
    const liabilitySection = disputeSection + 1;
    sections.push(`${liabilitySection}. LIMITATION OF LIABILITY`);
    sections.push('');
    sections.push('Bloxtr8 acts solely as an intermediary platform and escrow service. Bloxtr8 makes no warranties regarding the Asset and shall not be liable for:');
    sections.push('');
    sections.push('a) The quality, performance, or legality of the Asset;');
    sections.push('');
    sections.push('b) Any actions taken by Roblox Corporation, including but not limited to asset removal, account suspension, or policy enforcement;');
    sections.push('');
    sections.push('c) Changes to the Asset\'s value or performance after transfer;');
    sections.push('');
    sections.push('d) Any consequential, indirect, or punitive damages arising from this transaction.');
    sections.push('');

    // Governing Law
    const lawSection = liabilitySection + 1;
    sections.push(`${lawSection}. GOVERNING LAW`);
    sections.push('');
    sections.push('This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions.');
    sections.push('');

    // Entire Agreement
    const finalSection = lawSection + 1;
    sections.push(`${finalSection}. ENTIRE AGREEMENT`);
    sections.push('');
    sections.push('This Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, or agreements, whether written or oral.');
    sections.push('');

    // Signatures
    sections.push('---');
    sections.push('');
    sections.push('SIGNATURES');
    sections.push('');
    sections.push('By digitally signing this Agreement, both parties acknowledge that they have read, understood, and agree to be bound by all terms and conditions contained herein.');
    sections.push('');
    sections.push(`Offer ID: ${data.offer.id}`);
    sections.push(`Offer Accepted: ${data.offer.acceptedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
    sections.push('');
    sections.push('SELLER SIGNATURE:');
    sections.push(`Name: ${data.seller.name || 'User ' + data.seller.id}`);
    sections.push('Status: [To be signed]');
    sections.push('');
    sections.push('BUYER SIGNATURE:');
    sections.push(`Name: ${data.buyer.name || 'User ' + data.buyer.id}`);
    sections.push('Status: [To be signed]');
    sections.push('');
    sections.push('---');
    sections.push('');
    sections.push('Generated by Bloxtr8 - Secure Roblox Asset Trading Platform');
    sections.push(`Contract generated: ${data.createdAt.toISOString()}`);

    return sections;
  },
};

/**
 * Get the active contract template (default to latest version)
 */
export function getActiveContractTemplate(): ContractTemplate {
  return CONTRACT_TEMPLATE_V1;
}

/**
 * Format currency amount for display
 */
export function formatCurrencyAmount(amountCents: string | bigint, currency = 'USD'): string {
  const amount = Number(amountCents) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

