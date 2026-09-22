#!/usr/bin/env bash
# Starts one redis-stack-server (Redis + RediSearch) per line of $INSTANCES_FILE.
# Line format: <port>:<password>   (blank lines and lines starting with # are ignored)
set -euo pipefail

CONF=${INSTANCES_FILE:-/instances.conf}

if [[ ! -f "$CONF" ]]; then
  echo "redis-sandbox: instances file '$CONF' not found. Mount a '<port>:<password>' per line file there." >&2
  exit 1
fi

started=0
while IFS=: read -r port password || [[ -n "${port:-}" ]]; do
  port=${port//[[:space:]]/}
  [[ -z "$port" || "$port" == \#* ]] && continue
  if [[ ! "$port" =~ ^[0-9]+$ || -z "$password" ]]; then
    echo "redis-sandbox: invalid line '$port:$password' (expected <port>:<password>)" >&2
    exit 1
  fi

  mkdir -p "/data/$port"
  digest=$(printf %s "$password" | sha256sum)
  digest=${digest%% *}
  redis-stack-server \
    --port "$port" \
    --user "default on #$digest ~* &* +@all -@admin" \
    --dir "/data/$port" \
    --save 60 1 \
    --maxmemory "${REDIS_MAXMEMORY:-128mb}" \
    --maxmemory-policy noeviction \
    --client-output-buffer-limit "normal 1048576 0 0" \
    --protected-mode no &
  started=$((started + 1))
  echo "redis-sandbox: started instance on port $port"
done < "$CONF"

if [[ "$started" -eq 0 ]]; then
  echo "redis-sandbox: no instances configured in '$CONF'" >&2
  exit 1
fi

# If any instance dies, exit so the container gets restarted as a whole.
wait -n
echo "redis-sandbox: an instance exited unexpectedly" >&2
exit 1
