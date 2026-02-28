# Puppeteer / Chromium на Linux

Для рендера изображений (daily digest) нужен Chromium. На Linux часто не хватает системных библиотек.

## Ошибка: `libnss3.so: cannot open shared object file`

Установи зависимости (Debian/Ubuntu):

```bash
sudo apt-get update
sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
  libpango-1.0-0 libcairo2 libxshmfence1
```

Минимальный набор (часто достаточно для устранения ошибки с libnss3):

```bash
sudo apt-get install -y libnss3
```

После установки снова запустите тест рендера:

```bash
cd /home/artur/trade-system && node scripts/test-digest-image-render.js
```
