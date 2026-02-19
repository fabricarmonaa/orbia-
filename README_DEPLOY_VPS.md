# Deploy Orbia v1 en VPS (Hostinger / Ubuntu 22.04)

## 1) Instalar Docker + Compose plugin
```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

## 2) Clonar y preparar variables
```bash
git clone <repo_url> orbia
cd orbia
cp .env.example .env.production
```

Editar `.env.production` con valores reales (DB, SESSION_SECRET, etc).

## 3) Levantar stack
```bash
docker compose up -d --build
```

Servicios:
- Web: `127.0.0.1:5000`
- AI: `127.0.0.1:8001`
- PostgreSQL: `127.0.0.1:5432`

## 4) Ejecutar migraciones (si aplica)
```bash
docker compose exec web npm run db:push
```

## 5) Verificar salud
```bash
curl http://127.0.0.1:5000/health
curl http://127.0.0.1:8001/health
```

## 6) Nginx reverse proxy
Copiar `infra/nginx/orbia.conf` a `/etc/nginx/sites-available/orbia.conf` y habilitar:
```bash
sudo ln -s /etc/nginx/sites-available/orbia.conf /etc/nginx/sites-enabled/orbia.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 7) TLS con certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com
```

## 8) Backup diario PostgreSQL
Usar `infra/scripts/backup.sh` con cron:
```bash
crontab -e
# ejemplo: 03:10 AM diario
10 3 * * * POSTGRES_DB=orbia POSTGRES_USER=orbia POSTGRES_PASSWORD='***' /ruta/repo/infra/scripts/backup.sh >> /var/log/orbia-backup.log 2>&1
```
