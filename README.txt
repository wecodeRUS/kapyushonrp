КапюшонRP. Инфо-портал сервера

Как это устроено
1) Сайт на хостинге читает данные из JSON-кэша (api/push_*.json).
2) GitHub Actions раз в 5 минут запускает __scraper (Playwright), парсит источники и пушит данные на сайт через /api/push.php.

Куда загрузить на Рег.ру
1) Менеджер файлов -> папка www -> папка домена.
2) Распакуй архив так, чтобы index.html лежал в корне папки домена.

Настройка ключа
1) Открой файл api/_config.php
2) Поставь свой ключ вместо CHANGE_ME

GitHub Actions (автообновление без VPS)
1) Создай репозиторий на GitHub и залей в него все файлы из архива.
2) В репозитории: Settings -> Secrets and variables -> Actions -> New repository secret
   PUSH_URL = https://твой_домен/api/push.php
   PUSH_KEY = ключ из api/_config.php
3) Открой вкладку Actions и запусти workflow Scrape and Push вручную один раз.

Проверка
1) Открой /api/health.php
2) В блоке push должны появиться count и updated_at для staff, bans, economy, rules.
