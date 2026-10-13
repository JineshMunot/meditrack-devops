# VLE PBL-3 (Exp 7, 8, 9) - MediTrack Patient Records

One project covers all three experiments:

| Part | What |
|---|---|
| Frontend | HTML/CSS/JS page (add / list / delete patients, audit trail, version + colour badge) |
| Backend | Node.js + Express REST API, validation, rate limiting, security headers, Prometheus `/metrics` |
| Database | PostgreSQL (persistent volume) |
| Git | GitHub repo; Jenkins polls it every minute |
| Docker | multi-stage Dockerfile (test stage, non-root prod image) |
| Kubernetes | k3s on one EC2 instance: Postgres, blue + green Deployments, live + preview Services |
| Jenkins | Pipeline: test -> scan -> build -> push -> deploy idle colour -> smoke test -> approve -> switch |
| Grafana | Dashboard: patients, blue/green pods, req/s, latency, CPU, memory |

Ports: Jenkins 8080, Grafana 3000, App live 30080, App preview 30081, Prometheus 9090.

---------------------------------------------------------------
## PART A - Git (do on your laptop, 3 minutes)

1. Create an EMPTY PUBLIC repo on GitHub, e.g. `meditrack-devops`.
2. Unzip this project, open a terminal inside the folder:

```
git init -b main
git add .
git commit -m "MediTrack: app, k8s, jenkins, grafana"
git remote add origin https://github.com/YOURUSER/meditrack-devops.git
git push -u origin main
```

**SCREENSHOT 1 (Exp 7):** GitHub repo page showing the files + the terminal with `git log --oneline`.

---------------------------------------------------------------
## PART B - Launch ONE EC2 instance (AWS Academy Learner Lab)

Start Lab -> AWS (green dot) -> EC2 -> Launch instance:

- Name: `vle-pbl3`
- AMI: Ubuntu Server 22.04 LTS
- Instance type: **t3.large** (about $0.083/hour)
- Key pair: `vockey`
- Network settings -> Create security group, add rules (Source = **My IP**):
  SSH 22, Custom TCP 8080, 3000, 30080, 30081, 9090
- Storage: 25 GiB gp3
- Advanced details -> **User data** (paste, replace YOURUSER/REPO):

```
#!/bin/bash
export HOME=/root
git clone https://github.com/YOURUSER/meditrack-devops.git /opt/vle
bash /opt/vle/scripts/setup.sh https://github.com/YOURUSER/meditrack-devops.git > /var/log/setup.log 2>&1
```

Launch. Setup takes about 10 minutes. To watch it: select instance -> Connect ->
EC2 Instance Connect -> Connect, then `sudo tail -f /var/log/setup.log`.
Wait for the line `SETUP COMPLETE`.

Copy the instance's **Public IPv4 address** (call it IP).

If you open the site from a different network than the one you launched from,
edit the security group source to `0.0.0.0/0` for those ports.

**SCREENSHOT 2 (Exp 7):** EC2 console, instance running (shows type + public IP).

---------------------------------------------------------------
## EXPERIMENT 7 - CI/CD pipeline: Dockerized app on Kubernetes using Jenkins

1. Open `http://IP:8080` -> login `admin` / `admin123`.
2. Job `patient-app` is already there. Within ~1 minute it starts build #1
   by itself (if not, click **Build Now**).
3. Wait until the pipeline pauses at **Approve Switch** (about 5-6 min, first build is slow).
   Click the build -> **Pipeline Overview / Stage View**.

**SCREENSHOT 3:** Jenkins stage view: all green stages up to "Approve Switch", with the job name visible.

4. Click the paused stage -> **Switch traffic**. Wait for green "Switch Traffic".
5. Open `http://IP:30080` and add 2-3 patients (real frontend -> API -> Postgres).

**SCREENSHOT 4:** App in browser with patients listed (URL with IP:30080 visible).

6. On EC2 Instance Connect terminal run:

```
sudo kubectl get pods,svc,pvc -n healthcare
sudo docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
sudo docker images | head
```

**SCREENSHOT 5:** that terminal output (pods, services, Docker containers/images).

---------------------------------------------------------------
## EXPERIMENT 8 - Automated Blue-Green deployment (Jenkins + Kubernetes + Docker)

Build #1 went to the GREEN colour (live is now green). Now release a new version
with a visible change. On your laptop, in the project folder:

```
sed -i 's/Patient Records/Patient Records v2/' app/public/index.html
git add . && git commit -m "v2: new heading" && git push
```
(On Windows without sed: just edit the `<h1>` text in app/public/index.html by hand.)

Jenkins auto-starts build #2 within a minute and deploys to the idle colour (blue),
then pauses at **Approve Switch**. While paused:

- `http://IP:30080`  -> LIVE, still the old version (green)
- `http://IP:30081`  -> PREVIEW, the new version (blue)

**SCREENSHOT 6:** two browser windows side by side (30080 old, 30081 new) while Jenkins is paused.

Terminal:
```
sudo kubectl get deploy -n healthcare
sudo kubectl get svc -n healthcare -o wide
```

**SCREENSHOT 7:** that output (both deployments running, selectors showing slot=green live / slot=blue preview).

Click **Switch traffic** in Jenkins. Refresh `http://IP:30080` -> now new version, same patient data
(proves zero-downtime + shared database).

**SCREENSHOT 8:** Jenkins stage view with build #2 fully green + live page showing new version.

Optional (demo): instant rollback
```
sudo bash /opt/vle/scripts/bg-rollback.sh
```
Refresh 30080 -> old version is back instantly.

---------------------------------------------------------------
## EXPERIMENT 9 - DevSecOps in a healthcare system

Security controls already built in:

| Stage | Control |
|---|---|
| Code | input validation, parameterised SQL (no SQL injection), no inline JS + helmet CSP (XSS), rate limiting, 10kb body limit, audit trail table |
| Pipeline | `npm audit` (critical), Trivy secret scan, Trivy image scan (fails build on fixable CRITICAL CVE), Trivy k8s config report |
| Container | multi-stage, non-root user, minimal alpine image |
| Kubernetes | Secret for DB password, NetworkPolicy (only app pods reach Postgres), runAsNonRoot, read-only root filesystem, all capabilities dropped, resource limits, probes |

1. Jenkins -> build #2 (or #1) -> **Console Output**. Scroll to the Trivy / npm audit sections.

**SCREENSHOT 9:** console output showing "Secret + Config Scan" and "Image Vulnerability Scan (Trivy)" results
(or use Stage View -> hover/click the stage logs).

2. Terminal:
```
sudo kubectl get secret,networkpolicy -n healthcare
sudo kubectl get pod -n healthcare -l app=patient-app -o jsonpath='{.items[0].spec.containers[0].securityContext}{"\n"}{.items[0].spec.securityContext}{"\n"}'
```

**SCREENSHOT 10:** that output (secret, NetworkPolicy, non-root / read-only / drop ALL).

3. In the app, scroll to **Audit trail** (every list/create/delete is logged with which pod/version served it).
   Also try adding a patient with age 500 -> validation error.

**SCREENSHOT 11:** app showing audit trail + validation error message.

4. Grafana `http://IP:3000` (admin / admin123) -> Dashboards -> **MediTrack - App & Blue/Green**.
   Add/refresh patients a few times so the graphs move.

**SCREENSHOT 12:** Grafana dashboard (patients count, blue/green pods, request rate, CPU).

---------------------------------------------------------------
## FACULTY DEMO (about 5 minutes)

1. Show GitHub repo + architecture (frontend -> API -> Postgres, all in Docker on Kubernetes).
2. Make a small code change, `git push`. Show Jenkins starting automatically.
3. Walk through the stages (tests, Trivy scans, build, push, deploy to idle colour).
4. Pause at approval: show live (old) vs preview (new) side by side.
5. Click Switch -> refresh live site, data is still there.
6. Show Grafana dashboard moving, show `kubectl get pods` and the audit trail.
7. (Bonus) run rollback script.

Do a full dry run once before the demo so Docker layers are cached (builds then take ~2 min).

---------------------------------------------------------------
## BUDGET

t3.large is about $0.083/hour (about $2 for a full 24 hours) + 25 GB disk (~$0.1/day).
**Stop the instance** (EC2 -> Instance state -> Stop) when not working, and end the lab.
After a stop/start the public IP changes; Jenkins, Kubernetes, Grafana and the
database all come back by themselves (about 2 minutes). Do NOT terminate until
the faculty demo is finished and all screenshots are taken.

## TROUBLESHOOTING

- Setup log: `sudo tail -n 50 /var/log/setup.log`
- Jenkins not building after 2 min: click **Build Now**.
- Build failed at Trivy image scan: open console output, it lists the CVE. Quick workaround:
  edit Jenkinsfile, change `--severity CRITICAL` to `--severity CRITICAL --ignore-unfixed` (already set) or
  add `--exit-code 0` to just report.
- Pods not starting: `sudo kubectl describe pod -n healthcare <name>` and `sudo kubectl logs -n healthcare <name>`.
- Reset an approval that timed out: click **Build Now** again.
