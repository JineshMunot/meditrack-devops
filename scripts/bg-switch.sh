#!/bin/bash
# Flip LIVE traffic (port 30080) to the colour currently on the preview service.
# The old colour is kept at 1 replica so rollback is instant.
set -euo pipefail
NS=healthcare
k() { kubectl -n "$NS" "$@"; }

OLD=$(k get svc patient-app -o jsonpath='{.spec.selector.slot}')
NEW=$(k get svc patient-app-preview -o jsonpath='{.spec.selector.slot}')
if [ "$OLD" = "$NEW" ]; then echo "Preview and live are the same colour ($NEW) - nothing to switch"; exit 1; fi

k patch svc patient-app -p "{\"spec\":{\"selector\":{\"app\":\"patient-app\",\"slot\":\"$NEW\"}}}"
k scale deploy/patient-app-$OLD --replicas=1
echo "Traffic switched: $OLD -> $NEW (zero downtime). $OLD kept as standby for rollback."
