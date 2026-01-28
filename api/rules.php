<?php
require_once __DIR__.DIRECTORY_SEPARATOR.'_utils.php';
$p=_push_get('rules', 31536000);
if(is_array($p)) _json($p);
$key='rules_famerp';
$c=_cache_get($key, 31536000);
if(is_array($c)) _json($c);
_json(array('ok'=>false,'version'=>'-','sections'=>array(),'updated_at'=>time()));
