<?php
require_once __DIR__.DIRECTORY_SEPARATOR.'_utils.php';
$p=_push_get('economy', 31536000);
if(is_array($p)) _json($p);
_json(array('ok'=>false,'players'=>array(),'top3'=>array(),'updated_at'=>time()));
