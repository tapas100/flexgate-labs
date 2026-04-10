import type { Config } from 'jest';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env so all process.env values are available in tests
dotenv.config({ path: path.resolve(__dirname, '.env') });

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 60000,          // 60s — chaos/circuit-breaker tests need time
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.json' }],
  },
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'reports', outputName: 'junit.xml' }],
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverage: false,
  // Run tests serially to avoid port conflicts and shared infra race conditions
  maxWorkers: 1,
  // Increase default async timeouts for infrastructure-heavy tests
  testSequencer: '@jest/test-sequencer',
};

export default config;
