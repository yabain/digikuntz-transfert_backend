#!/bin/bash
set -e

APP_USER="digikuntz"
APP_GROUP="digikuntz"
APP_DIR="/home/digikuntz/apps/app-backend"
REPO_URL="https://github.com/yabain/digikuntz-transfert_backend.git"
SERVICE_NAME="digikuntz-backend"
NODE_BIN="/opt/cpanel/ea-nodejs20/bin/node"
NPM_BIN="/opt/cpanel/ea-nodejs20/bin/npm"
NPX_BIN="/opt/cpanel/ea-nodejs20/bin/npx"
BACKUP_DIR="/root/backend-deploy-backups"

echo "=================================================="
echo " Déploiement Digikuntz Backend"
echo "=================================================="

mkdir -p "$BACKUP_DIR"

echo "[1/10] Vérification du dossier projet..."

if [ ! -d "$APP_DIR" ]; then
  echo "Le dossier $APP_DIR n'existe pas. Création..."
  mkdir -p "$APP_DIR"
  chown -R "$APP_USER:$APP_GROUP" /home/digikuntz/apps
fi

cd "$APP_DIR"
echo "[2/10] Sauvegarde du .env..."

if [ -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env" "$BACKUP_DIR/.env.$(date +%F_%H-%M-%S).bak"
  cp "$APP_DIR/.env" /tmp/digikuntz-backend.env.deploy.bak
else
  echo "ATTENTION: aucun fichier .env trouvé."
fi

echo "[3/10] Préparation Git..."

if [ ! -d "$APP_DIR/.git" ]; then
  echo "Aucun dépôt Git trouvé. Nettoyage du dossier sauf .env, puis clone..."
  find "$APP_DIR" -mindepth 1 ! -name ".env" -exec rm -rf {} +
  git clone "$REPO_URL" /tmp/digikuntz-backend-clone
  shopt -s dotglob
  mv /tmp/digikuntz-backend-clone/* "$APP_DIR"/
  rm -rf /tmp/digikuntz-backend-clone
else
  git remote set-url origin "$REPO_URL"
fi

echo "[4/10] Récupération dernière version GitHub..."

git fetch origin --prune

BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || true)

if [ -z "$BRANCH" ]; then
  if git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
   BRANCH="main"
  elif git ls-remote --exit-code --heads origin master >/dev/null 2>&1; then
    BRANCH="master"
  else
    echo "Impossible de déterminer la branche principale."
    exit 1
  fi
fi

echo "Branche détectée: $BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "[5/10] Restauration du .env..."

if [ -f /tmp/digikuntz-backend.env.deploy.bak ]; then
  cp /tmp/digikuntz-backend.env.deploy.bak "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  chown "$APP_USER:$APP_GROUP" "$APP_DIR/.env"
fi

echo "[6/10] Installation des dépendances..."

chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"

# Utilisation de npm install pour forcer la mise à jour du lock asynchrone et forcer l'usage du binaire cPanel Node 20
su - "$APP_USER" -c "cd '$APP_DIR' && $NPM_BIN install --no-audit --no-fund"

echo "[7/10] Installation module-alias si nécessaire..."

su - "$APP_USER" -c "cd '$APP_DIR' && $NPM_BIN install module-alias --no-save"

echo "[8/10] Création du fichier app.js de production..."

cat > "$APP_DIR/app.js" <<'EOF'
const moduleAlias = require('module-alias');

moduleAlias.addAlias('src', __dirname + '/dist');

require('./dist/main.js');
EOF

chown "$APP_USER:$APP_GROUP" "$APP_DIR/app.js"
chmod 644 "$APP_DIR/app.js"

echo "[9/10] Compilation TypeScript..."

su - "$APP_USER" -c "cd '$APP_DIR' && $NPM_BIN run build"

echo "[10/10] Redémarrage du service..."

sudo systemctl restart "$SERVICE_NAME"

sleep 5

sudo systemctl status "$SERVICE_NAME" --no-pager

echo "=================================================="
echo " Test local"
echo "=================================================="

curl -I http://127.0.0.1:3002/api/docs || true

echo "=================================================="
echo " Déploiement terminé"
echo " Logs en temps réel du backend"
echo " Pour quitter les logs : CTRL + C"
echo "=================================================="

sudo journalctl -u "$SERVICE_NAME" -f

