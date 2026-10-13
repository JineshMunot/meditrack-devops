pipeline {
  agent any

  environment {
    IMAGE = 'localhost:5000/patient-app'
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {

    stage('Checkout (Git)') {
      steps {
        checkout scm
        sh 'git log -1 --oneline'
      }
    }

    stage('Unit Tests + npm audit') {
      steps {
        // Dockerfile "test" stage runs: npm test && npm audit --audit-level=critical
        sh 'docker build --target test -t patient-app:test app'
      }
    }

    stage('Secret + Config Scan (DevSecOps)') {
      steps {
        sh 'trivy fs --scanners secret --exit-code 1 --no-progress app'
        sh 'trivy config --exit-code 0 --no-progress k8s || true'
      }
    }

    stage('Build Docker Image') {
      steps {
        sh 'docker build -t $IMAGE:$BUILD_NUMBER -t $IMAGE:latest app'
      }
    }

    stage('Image Vulnerability Scan (Trivy)') {
      steps {
        // build fails if a fixable CRITICAL vulnerability is found
        sh 'trivy image --exit-code 1 --severity CRITICAL --ignore-unfixed --no-progress $IMAGE:$BUILD_NUMBER'
      }
    }

    stage('Push to Registry') {
      steps {
        sh 'docker push $IMAGE:$BUILD_NUMBER'
      }
    }

    stage('Deploy to Idle Slot (Blue/Green)') {
      steps {
        sh 'bash scripts/bg-deploy.sh $IMAGE $BUILD_NUMBER'
      }
    }

    stage('Smoke Test Preview') {
      steps {
        sh '''
          for i in $(seq 1 20); do
            if curl -fsS http://localhost:30081/health; then echo; break; fi
            [ $i -eq 20 ] && exit 1
            sleep 3
          done
          curl -fsS http://localhost:30081/api/patients > /dev/null && echo "API + database OK on preview"
        '''
      }
    }

    stage('Approve Switch') {
      steps {
        timeout(time: 60, unit: 'MINUTES') {
          input message: 'Preview is on port 30081. Switch live traffic (port 30080) to the new version?', ok: 'Switch traffic'
        }
      }
    }

    stage('Switch Traffic') {
      steps {
        sh 'bash scripts/bg-switch.sh'
      }
    }
  }

  post {
    success { echo "Build ${BUILD_NUMBER} is LIVE on port 30080" }
    failure { echo 'Pipeline failed - live traffic was NOT changed.' }
  }
}
