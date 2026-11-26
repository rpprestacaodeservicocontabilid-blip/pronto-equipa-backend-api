#!/bin/sh
set -eu

case "${DB_USER:-}" in
  ''|*[!a-zA-Z0-9_]*) echo 'DB_USER must contain only letters, digits, and underscores.' >&2; exit 1 ;;
esac
case "${DB_NAME:-}" in
  ''|*[!a-zA-Z0-9_]*) echo 'DB_NAME must contain only letters, digits, and underscores.' >&2; exit 1 ;;
esac
case "${DB_ACL_USER:-}" in
  ''|*[!a-zA-Z0-9_]*) echo 'DB_ACL_USER must contain only letters, digits, and underscores.' >&2; exit 1 ;;
esac

if [ -n "${DB_ACL_PASSWORD_FILE:-}" ]; then
  acl_password=$(cat "$DB_ACL_PASSWORD_FILE")
else
  acl_password=${DB_ACL_PASSWORD:?DB_ACL_PASSWORD_FILE is required}
fi
mysql_cmd() {
  MYSQL_PWD="$acl_password" mysql --protocol=tcp -h "$MYSQL_HOST" -u"$DB_ACL_USER" --batch --skip-column-names "$@"
}

tables=$(mysql_cmd -e "SHOW FULL TABLES FROM \`$DB_NAME\` WHERE Table_type='BASE TABLE'")
views=$(mysql_cmd -e "SHOW FULL TABLES FROM \`$DB_NAME\` WHERE Table_type='VIEW'")

# The runtime account is created without grants by the initialization hook. Grant
# table by table; it never receives schema DDL, triggers, grant option, or audit
# identity privileges.
while IFS="$(printf '\t')" read -r table _; do
  [ -n "$table" ] || continue
  case "$table" in
    audit_records)
      privileges='SELECT, INSERT'
      ;;
    audit_record_identities)
      continue
      ;;
    audit_capture_events)
      privileges='SELECT, UPDATE'
      ;;
    audit_scope_catalog)
      privileges='SELECT, INSERT'
      ;;
    audit_chain_heads)
      privileges='SELECT, INSERT, UPDATE'
      ;;
    audit_role_scopes)
      privileges='SELECT'
      ;;
    sequelize_migrations)
      privileges='SELECT'
      ;;
    *)
      privileges='SELECT, INSERT, UPDATE, DELETE'
      ;;
  esac
  mysql_cmd -e "GRANT $privileges ON \`$DB_NAME\`.\`$table\` TO '${DB_USER}'@'%'"
done <<EOF
$tables
EOF

while IFS="$(printf '\t')" read -r view _; do
  [ -n "$view" ] || continue
  mysql_cmd -e "GRANT SELECT ON \`$DB_NAME\`.\`$view\` TO '${DB_USER}'@'%'"
done <<EOF
$views
EOF

