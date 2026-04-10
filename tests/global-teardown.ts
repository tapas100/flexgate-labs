export default async function globalTeardown(): Promise<void> {
  console.log('\n🧹 Global Teardown: Cleaning up after tests...\n');
  // Any global cleanup (e.g., close DB connections, reset state) goes here
  console.log('✅ Teardown complete.\n');
}
