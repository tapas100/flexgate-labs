pipeline {
    agent any

    // ── NodeJS Plugin: installs Node and puts node/npm on PATH ──────────────
    // Prerequisite: Jenkins → Manage Jenkins → Tools → NodeJS installations
    //   Name: "NodeJS 18"  |  Version: 18.x LTS  |  Install automatically: ✅
    //   (matches the tool name used in the flexgate-proxy Jenkinsfile)
    tools {
        nodejs 'NodeJS 18'
    }

    environment {
        CI           = 'true'
        NODE_ENV     = 'test'
        // FlexGate proxy must be running and reachable from the Jenkins agent
        GATEWAY_URL  = credentials('flexgate-gateway-url')     // e.g. http://flexgate-proxy:3000
        DEMO_EMAIL   = credentials('flexgate-demo-email')      // admin@flexgate.dev
        DEMO_PASSWORD = credentials('flexgate-demo-password')  // FlexGate2026!SecureDemo
        PROMETHEUS_URL = credentials('flexgate-prometheus-url') // http://prometheus:9090
        WEBHOOK_RECEIVER_URL = 'http://localhost:3005'
        RUN_CHAOS    = 'false'   // set to 'true' in a nightly parameterised build
        SKIP_LOAD    = 'true'    // set to 'false' when k6 is installed on the agent
    }

    triggers {
        githubPush()
    }

    options {
        timeout(time: 45, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    stages {

        // ── 1. Checkout ────────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                checkout scm
                sh 'echo "Branch: ${GIT_BRANCH} | Commit: ${GIT_COMMIT}"'
            }
        }

        // ── 2. Verify Node ─────────────────────────────────────────────────
        stage('Setup Node.js') {
            steps {
                sh '''
                    echo "Node: $(node --version)"
                    echo "npm:  $(npm --version)"
                '''
            }
        }

        // ── 3. Install dependencies ────────────────────────────────────────
        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        // ── 4. Type Check ──────────────────────────────────────────────────
        stage('Type Check') {
            steps {
                sh 'npx tsc --noEmit'
            }
        }

        // ── 5. Start Mock Backend Services ────────────────────────────────
        //  Spins up the five mock upstreams (api-users, api-orders,
        //  flaky-service, slow-service, webhook-receiver) via podman-compose.
        //  The FlexGate proxy itself must already be running and reachable
        //  at GATEWAY_URL (managed separately / by the infra team).
        stage('Start Mock Services') {
            steps {
                sh '''
                    # Use the services-only compose file (no infra, no proxy)
                    podman-compose -f podman-compose.services.yml up -d --build
                    bash scripts/wait-for-ready.sh
                '''
            }
            post {
                failure {
                    sh 'podman-compose -f podman-compose.services.yml logs || true'
                }
            }
        }

        // ── 6. Seed Routes ─────────────────────────────────────────────────
        //  Registers /users, /orders, /flaky, /slow routes in the proxy DB.
        //  Idempotent — safe to run on every build.
        stage('Seed Routes') {
            steps {
                sh 'bash scripts/seed-routes.sh'
            }
        }

        // ── 7. E2E Tests ───────────────────────────────────────────────────
        stage('E2E Tests') {
            steps {
                sh '''
                    npx jest --config jest.config.ts \
                        --testPathPattern="tests/e2e" \
                        --runInBand --forceExit \
                        --reporters=default \
                        --reporters=jest-junit \
                        --outputFile=reports/e2e-results.xml \
                        || true
                '''
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'reports/e2e-results.xml'
                }
            }
        }

        // ── 8. Admin API Tests ─────────────────────────────────────────────
        stage('Admin API Tests') {
            steps {
                sh '''
                    npx jest --config jest.config.ts \
                        --testPathPattern="tests/admin" \
                        --runInBand --forceExit \
                        --reporters=default \
                        --reporters=jest-junit \
                        --outputFile=reports/admin-results.xml \
                        || true
                '''
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'reports/admin-results.xml'
                }
            }
        }

        // ── 9. Rate Limit Tests ────────────────────────────────────────────
        stage('Rate Limit Tests') {
            steps {
                sh '''
                    npx jest --config jest.config.ts \
                        --testPathPattern="tests/rate-limit" \
                        --runInBand --forceExit \
                        --reporters=default \
                        --reporters=jest-junit \
                        --outputFile=reports/rate-limit-results.xml \
                        || true
                '''
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'reports/rate-limit-results.xml'
                }
            }
        }

        // ── 10. Circuit Breaker Tests ──────────────────────────────────────
        stage('Circuit Breaker Tests') {
            steps {
                sh '''
                    npx jest --config jest.config.ts \
                        --testPathPattern="tests/circuit-breaker" \
                        --runInBand --forceExit \
                        --reporters=default \
                        --reporters=jest-junit \
                        --outputFile=reports/circuit-breaker-results.xml \
                        || true
                '''
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'reports/circuit-breaker-results.xml'
                }
            }
        }

        // ── 11. Retry & Timeout Tests ──────────────────────────────────────
        stage('Retry & Timeout Tests') {
            steps {
                sh '''
                    npx jest --config jest.config.ts \
                        --testPathPattern="tests/(retry|timeout)" \
                        --runInBand --forceExit \
                        --reporters=default \
                        --reporters=jest-junit \
                        --outputFile=reports/retry-timeout-results.xml \
                        || true
                '''
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'reports/retry-timeout-results.xml'
                }
            }
        }

        // ── 12. Security Tests ─────────────────────────────────────────────
        //  SSRF, header injection, payload abuse — run serially to avoid
        //  exhausting the proxy's rate limiter.
        stage('Security Tests') {
            steps {
                sh '''
                    npx jest --config jest.config.ts \
                        --testPathPattern="tests/security" \
                        --runInBand --forceExit \
                        --reporters=default \
                        --reporters=jest-junit \
                        --outputFile=reports/security-results.xml \
                        || true
                '''
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'reports/security-results.xml'
                }
            }
        }

        // ── 13. Observability Tests ────────────────────────────────────────
        stage('Observability Tests') {
            steps {
                sh '''
                    npx jest --config jest.config.ts \
                        --testPathPattern="tests/observability" \
                        --runInBand --forceExit \
                        --reporters=default \
                        --reporters=jest-junit \
                        --outputFile=reports/observability-results.xml \
                        || true
                '''
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'reports/observability-results.xml'
                }
            }
        }

        // ── 14. Chaos Tests (opt-in) ───────────────────────────────────────
        //  Disabled by default — enable by setting RUN_CHAOS=true in a
        //  nightly parameterised build or via Jenkins pipeline parameters.
        stage('Chaos Tests') {
            when {
                environment name: 'RUN_CHAOS', value: 'true'
            }
            steps {
                sh '''
                    npx jest --config jest.config.ts \
                        --testPathPattern="tests/chaos" \
                        --runInBand --forceExit \
                        --reporters=default \
                        --reporters=jest-junit \
                        --outputFile=reports/chaos-results.xml \
                        || true
                '''
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'reports/chaos-results.xml'
                }
            }
        }

        // ── 15. Load Tests (opt-in) ────────────────────────────────────────
        //  Requires k6 on the agent PATH.  Disabled by default.
        stage('Load Tests') {
            when {
                environment name: 'SKIP_LOAD', value: 'false'
            }
            steps {
                sh '''
                    k6 run --summary-export=reports/k6-baseline.json \
                        --env GATEWAY_URL="${GATEWAY_URL}" \
                        load/baseline.js || true
                '''
            }
            post {
                always {
                    archiveArtifacts allowEmptyArchive: true,
                        artifacts: 'reports/k6-baseline.json',
                        fingerprint: false
                }
            }
        }

        // ── 16. Generate Consolidated Report ──────────────────────────────
        stage('Generate Report') {
            steps {
                sh 'npx ts-node scripts/generate-report.ts || true'
            }
            post {
                always {
                    archiveArtifacts allowEmptyArchive: true,
                        artifacts: 'reports/summary-*.json,reports/run-*.log',
                        fingerprint: false
                }
            }
        }
    }

    // ── Post-build ──────────────────────────────────────────────────────────
    post {
        always {
            // Stop mock services regardless of outcome
            sh 'podman-compose -f podman-compose.services.yml down || true'
            cleanWs()
        }
        success {
            echo '✅ FlexGate test pipeline succeeded.'
        }
        failure {
            echo '❌ FlexGate test pipeline failed — check test reports above.'
        }
    }
}
