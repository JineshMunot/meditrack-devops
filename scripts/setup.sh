#!/bin/bash
# One-shot setup for a fresh Ubuntu EC2 instance (run as root, e.g. from EC2 user data).
# usage: setup.sh <github-repo-url>
# Installs: Docker, local registry, k3s (Kubernetes), Postgres + blue/green manifests,
#           Jenkins (with kubectl, docker CLI, trivy), Prometheus, node-exporter, Grafana.
set -euxo pipefail
REPO_URL=${1:?usage: setup.sh <github-repo-url>}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
export DEBIAN_FRONTEND=noninteractive

# ---- Docker + local registry ----
apt-get update -y
apt-get install -y docker.io curl git
systemctl enable --now docker
docker run -d --restart=always --name registry -p 5000:5000 registry:2

# ---- Kubernetes (k3s) - pulls images from the local registry over http ----
mkdir -p /etc/rancher/k3s
cat > /etc/rancher/k3s/registries.yaml <<'EOF'
mirrors:
  "localhost:5000":
    endpoint:
      - "http://localhost:5000"
EOF
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--write-kubeconfig-mode 644 --disable traefik --disable servicelb" sh -
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
ln -sf /usr/local/bin/k3s /usr/local/bin/kubectl 2>/dev/null || true
until kubectl get nodes 2>/dev/null | grep -q " Ready"; do sleep 3; done

# ---- Database + blue/green app manifests (applied ONCE here; Jenkins only patches them) ----
kubectl apply -f "$ROOT/k8s/00-base.yaml"
kubectl apply -f "$ROOT/k8s/10-app-bluegreen.yaml"
kubectl -n healthcare rollout status deploy/postgres --timeout=240s

# ---- Jenkins ----
sed -i "s#REPO_URL_PLACEHOLDER#${REPO_URL}#" "$ROOT/jenkins/job-config.xml"
docker build -t jenkins-custom "$ROOT/jenkins"
docker run -d --restart=unless-stopped --name jenkins --network host --user root \
  -v jenkins_home:/var/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /etc/rancher/k3s/k3s.yaml:/kube/config:ro \
  -e KUBECONFIG=/kube/config \
  -e JAVA_OPTS="-Djenkins.install.runSetupWizard=false" \
  jenkins-custom

# ---- Monitoring: node-exporter, Prometheus, Grafana ----
docker run -d --restart=unless-stopped --name node-exporter --network host prom/node-exporter
docker run -d --restart=unless-stopped --name prometheus --network host \
  -v "$ROOT/monitoring/prometheus.yml":/etc/prometheus/prometheus.yml:ro \
  -v /etc/rancher/k3s/k3s.yaml:/kube/config:ro \
  prom/prometheus
docker run -d --restart=unless-stopped --name grafana --network host \
  -e GF_SECURITY_ADMIN_USER=admin -e GF_SECURITY_ADMIN_PASSWORD=admin123 \
  -v "$ROOT/monitoring/grafana/provisioning":/etc/grafana/provisioning:ro \
  -v "$ROOT/monitoring/grafana/dashboards":/var/lib/grafana/dashboards:ro \
  grafana/grafana

echo "SETUP COMPLETE"
echo "Jenkins : http://<public-ip>:8080   (admin / admin123)"
echo "Grafana : http://<public-ip>:3000   (admin / admin123)"
echo "App     : http://<public-ip>:30080  (after first Jenkins build)"
