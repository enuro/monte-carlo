#!/bin/bash
# =============================================================================
# init-letsencrypt.sh — первичная настройка SSL-сертификата от Let's Encrypt
#
# Запускать ОДИН РАЗ перед первым стартом сервера.
# Последующие обновления сертификата происходят автоматически через certbot.
# =============================================================================
set -e

# ── Загрузка конфига ──────────────────────────────────────────────────────────
if [ ! -f .env ]; then
    echo "Ошибка: файл .env не найден."
    echo "Скопируй .env.example в .env и заполни DOMAIN и EMAIL."
    exit 1
fi

# shellcheck source=.env
source .env

if [ -z "$DOMAIN" ]; then
    echo "Ошибка: переменная DOMAIN не задана в .env"
    exit 1
fi

if [ -z "$EMAIL" ]; then
    echo "Ошибка: переменная EMAIL не задана в .env"
    exit 1
fi

echo "========================================"
echo " Домен : $DOMAIN"
echo " Email : $EMAIL"
echo "========================================"
echo ""

# ── Создание директорий ───────────────────────────────────────────────────────
mkdir -p ./certbot/conf/live/"$DOMAIN" ./certbot/www

# ── Временный самоподписанный сертификат (нужен для первого старта nginx) ──────
if [ ! -f ./certbot/conf/live/"$DOMAIN"/fullchain.pem ]; then
    echo "[1/4] Создаём временный самоподписанный сертификат..."
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout ./certbot/conf/live/"$DOMAIN"/privkey.pem \
        -out    ./certbot/conf/live/"$DOMAIN"/fullchain.pem \
        -subj   "/CN=localhost" 2>/dev/null
    echo "      Готово."
else
    echo "[1/4] Временный сертификат уже существует — пропускаем."
fi

# ── DH-параметры (генерируется один раз, повышает безопасность TLS 1.2) ───────
if [ ! -f ./certbot/conf/ssl-dhparams.pem ]; then
    echo "[2/4] Генерируем DH-параметры (может занять 1-2 минуты)..."
    openssl dhparam -out ./certbot/conf/ssl-dhparams.pem 2048 2>/dev/null
    echo "      Готово."
else
    echo "[2/4] DH-параметры уже существуют — пропускаем."
fi

# ── Запускаем nginx с временным сертификатом ──────────────────────────────────
echo "[3/4] Запускаем nginx..."
docker compose up -d nginx

echo "      Ждём готовности nginx..."
for i in $(seq 1 12); do
    if docker compose exec nginx nginx -t 2>/dev/null; then
        break
    fi
    sleep 5
done

# ── Запрашиваем настоящий сертификат от Let's Encrypt ────────────────────────
echo "[4/4] Запрашиваем сертификат Let's Encrypt для $DOMAIN ..."

# Удаляем временный сертификат, чтобы certbot мог создать реальный
rm -rf ./certbot/conf/live/"$DOMAIN"

docker compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

# ── Перезагружаем nginx с реальным сертификатом ───────────────────────────────
echo ""
echo "Перезагружаем nginx с настоящим сертификатом..."
docker compose exec nginx nginx -s reload

# ── Запускаем остальные сервисы ───────────────────────────────────────────────
echo "Запускаем backend и certbot (автообновление)..."
docker compose up -d

echo ""
echo "========================================"
echo " Готово! Сайт доступен по адресу:"
echo " https://$DOMAIN"
echo "========================================"
