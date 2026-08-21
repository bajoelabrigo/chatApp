#!/bin/sh
# Añade X-Forwarded-For al proxy de api.holyholyholy.es.
#
# Sin esta cabecera, Express ve la IP de nginx en TODAS las peticiones y el
# límite de intentos de /auth se convierte en un cubo único para toda la
# comunidad. Ver "middleware/rateLimit.ts".
#
# Es idempotente (si ya está, no toca nada) y se revierte solo si `nginx -t`
# no valida, así que el sitio nunca se queda servido con una config rota.
set -e

CONF=/etc/nginx/sites-enabled/api-chat
BACKUP="$CONF.bak-$(date +%F-%H%M%S)"

[ -f "$CONF" ] || { echo "ERROR: no existe $CONF"; exit 1; }

if grep -qi 'x-forwarded-for' "$CONF"; then
  echo "Ya tiene X-Forwarded-For. No se cambia nada."
  exit 0
fi

cp "$CONF" "$BACKUP"
echo "Copia de seguridad -> $BACKUP"

awk '
  !hecho && /^[[:space:]]*location[[:space:]]+\/[[:space:]]*\{/ {
    print
    print "        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;"
    print "        proxy_set_header X-Real-IP         $remote_addr;"
    print "        proxy_set_header X-Forwarded-Proto $scheme;"
    hecho = 1
    next
  }
  { print }
' "$BACKUP" > "$CONF"

if ! grep -qi 'x-forwarded-for' "$CONF"; then
  cp "$BACKUP" "$CONF"
  echo "ERROR: no se encontro un bloque 'location / {'. Restaurado, sin cambios."
  exit 1
fi

if nginx -t; then
  systemctl reload nginx
  echo "OK: nginx recargado con X-Forwarded-For."
else
  cp "$BACKUP" "$CONF"
  echo "ERROR: config invalida. Restaurada la anterior. NO se recargo nginx."
  exit 1
fi
