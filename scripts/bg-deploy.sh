#!/bin/bash
# Deploy IMAGE:TAG to the IDLE colour and expose it on the preview service (port 30081).
# usage: bg-deploy.sh <image> <tag>
set -euo pipefail
IMAGE=$1; TAG=$2; NS=healthcare
k() { kubectl -n "$NS" "$@"; }

LIVE=$(k get svc patient-app -o jsonpath='{.spec.selector.slot}')
if [ "$LIVE" = "blue" ]; then TARGET=green; else TARGET=blue; fi
echo "LIVE=$LIVE  ->  deploying build $TAG to idle slot: $TARGET"

k set image deploy/patient-app-$TARGET app="$IMAGE:$TAG"
k set env   deploy/patient-app-$TARGET APP_VERSION="$TAG"
k scale     deploy/patient-app-$TARGET --replicas=2
k rollout status deploy/patient-app-$TARGET --timeout=180s
k patch svc patient-app-preview -p "{\"spec\":{\"selector\":{\"app\":\"patient-app\",\"slot\":\"$TARGET\"}}}"
echo "Preview ($TARGET) is ready on :30081"
