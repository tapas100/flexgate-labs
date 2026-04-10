// ─────────────────────────────────────────────────────────────────────────────
// flexgate-labs — Standalone Test Pipeline
//
// PURPOSE:
//   Used when test code itself changes (push to flexgate-labs repo).
//   Assumes FlexGate proxy + mock services are already running on the agent.
//
// FULL RELEASE FLOW (proxy push → infra → tests → npm publish) lives in:
//   flexgate-proxy/Jenkinsfile
// ─────────────────────────────────────────────────────────────────────────────

pipeline {
    agent any

    tools {
        nodejs 'NodeJS 20'
    }

    environment {
        CI            = 'true'
        NODE_ENV      = 'test'
        GATEWAY_URL   = 'http://localhost:3000'
        DEMO_EMAIL    = 'admin@flexgate.dev'
        DEMO_PASSWORD = credentials('flexgate-demo-password')
        PROMETHEUS_URL = 'http://localhost:9090'
    }

    triggers {
        githubPush()
    }

    options {
        timeout(time: 15, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
                sh 'echo "Branch: ${GIT_BRANCH} | Commit: ${GIT_COMMIT}"'
            }
        }

        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Type Check') {
            steps {
                sh 'npx tsc --noEmit'
            }
        }

        // ── Run full test suite ────────────────────────────────────────────
        // Proxy must already be running at GATEWAY_URL.
        // Full infra + release flow lives in flexgate-proxy/Jenkinsfile.
        //
        // TEST ORDER MATTERS:
        //   Rate-limit tests run BEFORE chaos/redis-down.test.ts.
        //   redis-down stops Redis mid-suite; if rate-limit tests run after
        //   that, Redis is gone and counter state is lost → false 429 results.
        //   jest --runInBand guarantees file-level serial order; the glob
        //   below orders by directory name which puts rate-limit before chaos.
        stage('Run Tests') {
            steps {
                sh '''
                    npx jest \
                        --config jest.config.ts \
                        --runInBand \
                        --forceExit \
                        --reporters=default \
                        --reporters=jest-junit \
                        --testPathPattern="(admin|circuit-breaker|e2e|observability|rate-limit|retry|security|timeout|chaos)" \
                        --testSequencer=./scripts/test-sequencer.js
                '''
            }
            post {
                always {
                    junit testResults: '**/reports/junit.xml', allowEmptyResults: true
                    archiveArtifacts artifacts: 'reports/**/*', allowEmptyArchive: true
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        success {
            echo '✅ All flexgate-labs tests passed.'
        }
        failure {
            echo '❌ Tests failed — check the junit report above.'
        }
    }
}
