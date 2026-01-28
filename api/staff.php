<?php
require_once __DIR__.DIRECTORY_SEPARATOR.'_utils.php';
$p=_push_get('staff', 31536000);
if(is_array($p)) _json($p);
_json(array('ok'=>false,'staff'=>array(),'updated_at'=>time()));
