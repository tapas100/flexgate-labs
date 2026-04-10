import * as fs from 'fs';
import * as path from 'path';

const REPORTS_DIR = path.join(process.cwd(), 'reports');
const chalk = require('chalk');

interface JestResult {
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: Array<{
    testFilePath: string;
    status: string;
    testResults: Array<{
      title: string;
      status: string;
      duration?: number;
      failureMessages?: string[];
    }>;
  }>;
}

interface SuiteReport {
  name: string;
  file: string;
  passed: number;
  failed: number;
  pending: number;
  status: 'PASS' | 'FAIL' | 'NOT_RUN';
  failures: string[];
}

function loadJestReport(filePath: string): JestResult | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function parseSuite(name: string, file: string): SuiteReport {
  const data = loadJestReport(path.join(REPORTS_DIR, file));
  if (!data) {
    return { name, file, passed: 0, failed: 0, pending: 0, status: 'NOT_RUN', failures: [] };
  }

  const failures: string[] = [];
  data.testResults.forEach((suite) => {
    suite.testResults.forEach((test) => {
      if (test.status === 'failed' && test.failureMessages) {
        failures.push(`${test.title}: ${test.failureMessages[0]?.slice(0, 200)}`);
      }
    });
  });

  return {
    name,
    file,
    passed: data.numPassedTests,
    failed: data.numFailedTests,
    pending: data.numPendingTests,
    status: data.numFailedTests === 0 ? 'PASS' : 'FAIL',
    failures,
  };
}

const suites: SuiteReport[] = [
  parseSuite('E2E Tests',              'e2e-results.json'),
  parseSuite('Rate Limit Tests',       'rate-limit-results.json'),
  parseSuite('Circuit Breaker Tests',  'circuit-breaker-results.json'),
  parseSuite('Retry & Timeout Tests',  'retry-timeout-results.json'),
  parseSuite('Security Tests',         'security-results.json'),
  parseSuite('Chaos Tests',            'chaos-results.json'),
  parseSuite('Observability Tests',    'observability-results.json'),
];

const totalPass    = suites.reduce((s, r) => s + r.passed, 0);
const totalFail    = suites.reduce((s, r) => s + r.failed, 0);
const totalPending = suites.reduce((s, r) => s + r.pending, 0);
const overallPassed = suites.filter(r => r.status !== 'NOT_RUN').every(r => r.status === 'PASS');

// ── Console Output ────────────────────────────────────────────────────────────
console.log('\n' + chalk.bold('═══════════════════════════════════════════════════'));
console.log(chalk.bold('          FlexGate Labs — Test Report'));
console.log(chalk.bold('═══════════════════════════════════════════════════'));
console.log(`  Generated : ${new Date().toISOString()}`);
console.log('');

suites.forEach((s) => {
  const icon   = s.status === 'PASS' ? chalk.green('✅') : s.status === 'FAIL' ? chalk.red('❌') : chalk.yellow('⏭ ');
  const label  = s.status === 'PASS' ? chalk.green('PASS') : s.status === 'FAIL' ? chalk.red('FAIL') : chalk.yellow('NOT RUN');
  const counts = `(${chalk.green(s.passed)} passed, ${chalk.red(s.failed)} failed, ${chalk.yellow(s.pending)} pending)`;
  console.log(`  ${icon}  ${s.name.padEnd(28)} ${label}  ${counts}`);
  if (s.failures.length > 0) {
    s.failures.slice(0, 3).forEach((f) => {
      console.log(chalk.red(`       ↳ ${f.slice(0, 120)}`));
    });
  }
});

console.log('');
console.log(chalk.bold('───────────────────────────────────────────────────'));
console.log(`  Total Tests   : ${totalPass + totalFail + totalPending}`);
console.log(`  ${chalk.green('Passed')}        : ${totalPass}`);
console.log(`  ${chalk.red('Failed')}        : ${totalFail}`);
console.log(`  ${chalk.yellow('Pending')}       : ${totalPending}`);
console.log('');

if (overallPassed) {
  console.log(chalk.bold.green('  ✅ ALL SUITES PASSED — FlexGate v1.0 release gate: GREEN'));
} else {
  console.log(chalk.bold.red('  ❌ FAILURES DETECTED — FlexGate v1.0 release gate: RED'));
}
console.log(chalk.bold('═══════════════════════════════════════════════════\n'));

// ── JSON Report ───────────────────────────────────────────────────────────────
const jsonReport = {
  generatedAt: new Date().toISOString(),
  overallPassed,
  summary: { totalPass, totalFail, totalPending },
  suites: suites.map((s) => ({
    name: s.name,
    status: s.status,
    passed: s.passed,
    failed: s.failed,
    pending: s.pending,
    failures: s.failures,
  })),
};

const reportPath = path.join(REPORTS_DIR, 'full-report.json');
fs.mkdirSync(REPORTS_DIR, { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(jsonReport, null, 2));
console.log(`  📄 JSON report saved to: ${reportPath}\n`);

process.exit(overallPassed ? 0 : 1);
