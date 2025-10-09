#!/bin/bash

# Backend

# git clone https://github.com/yabain/digikuntz-transfert_backend.git .

# cd ~/public_html/app.digikuntz.com # /home/digikuntz/public_html/app.digikuntz.com en sudo su
# git pull origin main
# /opt/cpanel/ea-nodejs18/bin/npm install -f
# /opt/cpanel/ea-nodejs18/bin/npm run build
# pm2 restart digikuntz-backend --update-env # ou /opt/cpanel/ea-nodejs18/bin/pm2 start dist/main.js --name digikuntz-backend si le process n'est pas démarré

cd ~/public_html/app.digikuntz.com
git pull origin main
/opt/cpanel/ea-nodejs18/bin/npm install
/opt/cpanel/ea-nodejs18/bin/npm run build
/opt/cpanel/ea-nodejs18/bin/pm2 start dist/main.js --interpreter /opt/cpanel/ea-nodejs18/bin/node --name digikuntz-backend
pm2 save
pm2 restart digikuntz-backend --update-env