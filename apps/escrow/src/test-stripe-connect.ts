/**
 * Test script to demonstrate Stripe Connect integration
 * This script shows how to use the MCP Stripe tools to set up a basic flow
 */

import { stripe } from './lib/stripe.js';

async function testStripeConnectSetup() {
  console.log('🧪 Testing Stripe Connect Setup...\n');

  try {
    // Test 1: Create a test customer
    console.log('1️⃣ Creating test customer...');
    const customer = await stripe.customers.create({
      name: 'Test Buyer',
      email: 'buyer@example.com',
    });
    console.log(`✅ Customer created: ${customer.id}`);

    // Test 2: Create a test product
    console.log('\n2️⃣ Creating test product...');
    const product = await stripe.products.create({
      name: 'Test Roblox Game',
      description: 'A test game for escrow demonstration',
    });
    console.log(`✅ Product created: ${product.id}`);

    // Test 3: Create a price for the product
    console.log('\n3️⃣ Creating price for product...');
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 5000, // $50.00
      currency: 'usd', // Stripe uses lowercase
    });
    console.log(`✅ Price created: ${price.id} - $50.00 USD`);

    // Test 4: Create a payment link (for demonstration)
    console.log('\n4️⃣ Creating payment link...');
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      metadata: {
        escrow: 'true',
        test: 'true',
      },
    });
    console.log(`✅ Payment link created: ${paymentLink.url}`);

    console.log('\n🎉 Stripe Connect setup test completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   Customer ID: ${customer.id}`);
    console.log(`   Product ID: ${product.id}`);
    console.log(`   Price ID: ${price.id}`);
    console.log(`   Payment Link: ${paymentLink.url}`);
    
    console.log('\n💡 Next steps:');
    console.log('   1. Set up Stripe Connect accounts for sellers');
    console.log('   2. Configure webhook endpoints');
    console.log('   3. Test the full escrow flow');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testStripeConnectSetup();
}

export { testStripeConnectSetup };
