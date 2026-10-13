#!/bin/bash
# Instant rollback: send LIVE traffic back to the standby colour.
set -euo pipefail
NS=healthcare
k() { kubectl -n "$NS" "$@"; }

CUR=$(k get svc patient-app -o jsonpath='{.spec.selector.slot}')
if [ "$CUR" = "blue" ]; then PREV=green; else PREV=blue; fi

k scale deploy/patient-app-$PREV --replicas=2
k rollout status deploy/patient-app-$PREV --timeout=120s
k patch svc patient-app -p "{\"spec\":{\"selector\":{\"app\":\"patient-app\",\"slot\":\"$PREV\"}}}"
k patch svc patient-app-preview -p "{\"spec\":{\"selector\":{\"app\":\"patient-app\",\"slot\":\"$CUR\"}}}"
echo "Rolled back: $CUR -> $PREV"
