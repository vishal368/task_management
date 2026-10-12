pipeline {
    agent any

    environment {
        BACKEND = 'devopsguru/task-management-backend'
        FRONTEND = 'devopsguru/task-management-frontend'
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
                    credentialsId: 'docker-cred',
                    usernameVariable: 'USER',
                    passwordVariable: 'PASS'
                )]) {
                    sh '''
                        echo "$PASS" | docker login -u "$USER" --password-stdin

                        docker push $BACKEND:$TAG
                        docker push $FRONTEND:$TAG

                        docker logout
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
                        kubectl -n task-management set image deployment/backend backend=$BACKEND:$TAG

                        kubectl -n task-management set image deployment/frontend frontend=$FRONTEND:$TAG
                    '''
                }
            }
        }
    }

    post {
        success {
            echo 'Build and Deployment Successful! That is great!'
        }

        failure {
            echo 'Build or Deployment Failed!'
        }
    }
}


// ls -l ~/.kube/config