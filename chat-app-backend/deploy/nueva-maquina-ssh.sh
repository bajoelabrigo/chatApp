#!/bin/sh
# Dar acceso al VPS a UNA MÁQUINA NUEVA (otro portátil, otro ordenador).
#
#   sh deploy/nueva-maquina-ssh.sh
#
# Se ejecuta EN LA MÁQUINA NUEVA, en Git Bash (Windows) o en una terminal normal
# (Linux/Mac). Es idempotente: correrlo dos veces no rompe nada.
#
# ── Por qué una clave por máquina y no copiar la que ya existe ───────────────
# Copiar la clave privada de un ordenador a otro funciona, pero:
#   - el secreto viaja (correo, USB, nube) y queda copiado en sitios que no
#     controlas;
#   - si un día pierdes UNO de los dos equipos, revocar el acceso de ese equipo
#     obliga a revocar el del otro también, porque son la misma clave.
# Con una clave por máquina, revocar es borrar UNA línea de `authorized_keys` en
# el servidor y los demás equipos siguen funcionando.
#
# ── ORDEN IMPORTANTE ────────────────────────────────────────────────────────
# Hazlo MIENTRAS el acceso por contraseña siga habilitado en el servidor: este
# script necesita entrar una vez para dejar la clave. Si ya lo desactivaste,
# usa la consola web de Hostinger (VPS → Terminal) y pega ahí la clave pública
# a mano en /root/.ssh/authorized_keys.
set -e

VPS_IP="145.223.27.84"
CLAVE="$HOME/.ssh/id_ed25519_holy"
NOMBRE="${1:-$(hostname)}"

echo "==> 1/3  Clave para esta máquina ($NOMBRE)"
if [ -f "$CLAVE" ]; then
  echo "    Ya existe $CLAVE — se reutiliza."
else
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"
  # Sin frase de paso: con una, cada despliegue exigiría desbloquear el agente a
  # mano. Lo que protege el archivo es la cuenta del sistema, y por eso esta
  # clave es EXCLUSIVA de este servidor: si se compromete, no arrastra nada más.
  ssh-keygen -t ed25519 -f "$CLAVE" -N "" -C "holychat-deploy-$NOMBRE"
  echo "    Creada."
fi

echo "==> 2/3  Autorizarla en el VPS (pedirá la contraseña de root UNA vez)"
if command -v ssh-copy-id >/dev/null 2>&1; then
  ssh-copy-id -i "$CLAVE.pub" "root@$VPS_IP"
else
  # Git Bash en Windows no trae ssh-copy-id: se hace a mano.
  PUB="$(cat "$CLAVE.pub")"
  ssh "root@$VPS_IP" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && grep -qxF '$PUB' ~/.ssh/authorized_keys || echo '$PUB' >> ~/.ssh/authorized_keys"
fi

echo "==> 3/3  Atajo 'holyvps' en ~/.ssh/config"
if grep -q "^Host holyvps" "$HOME/.ssh/config" 2>/dev/null; then
  echo "    Ya estaba."
else
  cat >> "$HOME/.ssh/config" <<EOF

# VPS de HolyChat / holyholyholy.es (Hostinger). Con esto basta \`ssh holyvps\`
# y \`scp ... holyvps:/ruta\`, sin contraseña y sin -i.
Host holyvps $VPS_IP
    HostName $VPS_IP
    User root
    IdentityFile $CLAVE
    IdentitiesOnly yes
EOF
  chmod 600 "$HOME/.ssh/config"
  echo "    Añadido."
fi

echo
echo "==> Comprobación (BatchMode PROHÍBE pedir contraseña: si responde, es la clave)"
if ssh -o BatchMode=yes -o ConnectTimeout=15 holyvps "echo '    OK: entra con clave desde esta máquina'; hostname"; then
  echo
  echo "Listo. Ya puedes desplegar desde aquí:"
  echo "  scp -r dist/* holyvps:/var/www/holy-app/frontend/dist/"
  echo "  ssh holyvps \"pm2 restart holy-backend\""
else
  echo "    FALLÓ. La clave no quedó autorizada; revisa el paso 2." >&2
  exit 1
fi
