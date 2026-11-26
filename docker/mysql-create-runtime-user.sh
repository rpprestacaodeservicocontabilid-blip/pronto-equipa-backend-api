#!/bin/sh
set -eu

case "${DB_USER:-}" in
  ''|*[!a-zA-Z0-9_]*) echo 'DB_USER must contain only letters, digits, and underscores.' >&2; exit 1 ;;
esac
case "${DB_ACL_USER:-}" in
  ''|*[!a-zA-Z0-9_]*) echo 'DB_ACL_USER must contain only letters, digits, and underscores.' >&2; exit 1 ;;
esac
case "${MYSQL_DATABASE:-}" in
  ''|*[!a-zA-Z0-9_]*) echo 'MYSQL_DATABASE must contain only letters, digits, and underscores.' >&2; exit 1 ;;
esac

runtime_password=$(cat /run/secrets/db_password)
acl_password=$(cat /run/secrets/db_acl_password)
case "$runtime_password" in
  ''|*[!a-fA-F0-9]*) echo 'DB_PASSWORD secret must be hexadecimal.' >&2; exit 1 ;;
esac
if [ "${#runtime_password}" -lt 32 ] || [ "${#runtime_password}" -gt 128 ]; then
  echo 'DB_PASSWORD secret must contain 32 to 128 hexadecimal characters.' >&2
  exit 1
fi
case "$acl_password" in
  ''|*[!a-fA-F0-9]*) echo 'DB_ACL_PASSWORD secret must be hexadecimal.' >&2; exit 1 ;;
esac
if [ "${#acl_password}" -lt 32 ] || [ "${#acl_password}" -gt 128 ]; then
  echo 'DB_ACL_PASSWORD secret must contain 32 to 128 hexadecimal characters.' >&2
  exit 1
fi

root_password=$(cat /run/secrets/mysql_root_password)
mysql --protocol=socket -uroot -p"$root_password" <<SQL
CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${runtime_password}';
ALTER USER '${DB_USER}'@'%' IDENTIFIED BY '${runtime_password}';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${DB_USER}'@'%';
CREATE USER IF NOT EXISTS '${DB_ACL_USER}'@'%' IDENTIFIED BY '${acl_password}';
ALTER USER '${DB_ACL_USER}'@'%' IDENTIFIED BY '${acl_password}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO '${DB_ACL_USER}'@'%' WITH GRANT OPTION;
SQL
