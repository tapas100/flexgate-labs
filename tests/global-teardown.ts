import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function restoreContainer(name: string, waitMs = 3000): Promise<void> {
  try {
    const { stdout } = await execAsync(`podman inspect --format '{{.State.Running}}' ${name}`);
    if (stdout.trim() === 'true') return; // already running
    console.log(`🔄 Restoring stopped container: ${name}`);
    await execAsync(`podman start ${name}`);
    await new Promise((r) => setTimeout(r, waitMs));
    console.log(`✅ ${name} restored`);
  } catch {
    // Container may not exist in this environment — ignore
  }
}

export default async function globalTeardown(): Promise<void> {
  console.log('\n🧹 Global Teardown: Restoring any containers stopped by chaos tests...\n');

  // Chaos tests stop containers and restore them in afterAll, but if a test
  // crashes mid-run the afterAll may not execute.  This is the safety net.
  await restoreContainer('flexgate-postgres', 8000); // Postgres takes longest
  await restoreContainer('flexgate-redis', 3000);
  await restoreContainer('flexgate-nats', 3000);
  await restoreContainer('flexgate-api-users', 4000);
  await restoreContainer('flexgate-api-orders', 3000);
  await restoreContainer('flexgate-flaky', 2000);
  await restoreContainer('flexgate-slow', 2000);
  await restoreContainer('flexgate-webhook', 2000);

  console.log('✅ Global teardown complete.\n');
}
