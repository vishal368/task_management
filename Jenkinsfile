pipeline {
    agent any

    environment {
        BACKEND = 'devoopsguru/task-management-backend'
        FRONTEND = 'devoopsguru/task-management-frontend'
        TAG = "${BUILD_NUMBER}"
    }

    stages {
        stage('Checkout Code') {
            steps {
                checkout scm
            }
        }

        stage('Build Images') {
            steps {
                sh '''
                    docker build -t $BACKEND:$TAG ./backend

                    docker build \
                    --build-arg VITE_API_URL=http://34.36.147.122 \
                    -t $FRONTEND:$TAG ./frontend
                '''
            }
        }

        stage('Login and Push') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'docker_cred',
                    usernameVariable: 'DOCKER_USERNAME',
                    passwordVariable: 'DOCKER_PASSWORD'
                )]) {
                    sh '''
                        set -eu
                        export DOCKER_CONFIG="$(mktemp -d)"
                        trap 'docker logout >/dev/null 2>&1 || true; rm -rf "$DOCKER_CONFIG"' EXIT

                        printf '%s' "$DOCKER_PASSWORD" | docker login \
                            --username "$DOCKER_USERNAME" --password-stdin

                        docker push "$BACKEND:$TAG"
                        docker push "$FRONTEND:$TAG"

                    '''
                }
            }
        }

        stage('Deploy') {
            steps {
                withCredentials([file(
                    credentialsId: 'gke-kubeconfig',
                    variable: 'KUBECONFIG'
                )]) {
                    sh '''
                        set -eu
                        kubectl -n task-management set image \
                            deployment/backend backend="$BACKEND:$TAG"

                        kubectl -n task-management set image \
                            deployment/frontend frontend="$FRONTEND:$TAG"

                        kubectl -n task-management rollout status \
                            deployment/backend --timeout=180s
                        kubectl -n task-management rollout status \
                            deployment/frontend --timeout=180s
                    '''
                }
            }
        }
    }

    post {
        success {
            echo 'Build and Deployment Successful!'
        }

        failure {
            echo 'Build or Deployment Failed!'
        }
    }
}