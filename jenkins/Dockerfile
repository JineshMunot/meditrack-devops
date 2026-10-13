FROM jenkins/jenkins:lts-jdk17
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends docker.io curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/$(curl -fsSL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
 && chmod +x /usr/local/bin/kubectl \
 && curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
USER jenkins
RUN jenkins-plugin-cli --plugins workflow-aggregator git pipeline-stage-view timestamper
COPY --chown=jenkins:jenkins init.groovy /usr/share/jenkins/ref/init.groovy.d/admin.groovy
COPY --chown=jenkins:jenkins job-config.xml /usr/share/jenkins/ref/jobs/patient-app/config.xml
