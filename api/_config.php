<?php
// Server-side push key for /api/push.php
// Prefer environment variable if set (safer for deployments), otherwise fallback to default.
$PUSH_KEY = getenv('PUSH_KEY');
if(!$PUSH_KEY) $PUSH_KEY = 'kRp_92384_x';
