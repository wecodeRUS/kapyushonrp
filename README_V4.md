# КапюшонRP v4.3

## Что важно
- SSL на домене должен быть валидный (Let's Encrypt ок).
- В GitHub Secrets должны быть:
  - PUSH_URL = https://<домен>/api/push.php
  - PUSH_KEY = ваш ключ из api/_config.php

## Проверка
- https://<домен>/api/health.php
