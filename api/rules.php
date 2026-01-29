<?php
require_once __DIR__.DIRECTORY_SEPARATOR.'_utils.php';
$p=_push_get('rules', 31536000);
if(is_array($p) && isset($p['sections']) && is_array($p['sections']) && count($p['sections'])>0){
  $blob=strtolower(json_encode($p['sections']));
  if(strpos($blob,'404')===false && strpos($blob,'page not found')===false && strpos($blob,'страница не найдена')===false) _json($p);
}
$key='rules_famerp';
$c=_cache_get($key, 31536000);
if(is_array($c)) _json($c);
_json(array('ok'=>false,'version'=>'-','sections'=>array(),'updated_at'=>time()));
