#!/bin/sh
set -eu

secret_file="${REDIS_PASSWORD_FILE:-/run/secrets/redis_password}"
if [ ! -r "$secret_file" ]; then
  echo "Redis password secret is missing or unreadable" >&2
  exit 1
fi

password=$(cat "$secret_file")
case "$password" in
  ''|*[!a-fA-F0-9]*)
    echo "Redis password must be a non-empty hexadecimal secret" >&2
    exit 1
    ;;
esac

umask 077
printf 'appendonly yes\nrequirepass %s\n' "$password" > /tmp/redis.conf
exec redis-server /tmp/redis.conf
