<?php
require_once __DIR__.DIRECTORY_SEPARATOR.'_utils.php';

// Берем пуш, если он валидный и не пустой
$p=_push_get('staff', 31536000);
if(is_array($p) && isset($p['staff']) && is_array($p['staff']) && count($p['staff'])>0){
  _json($p);
}

// Фолбек: desk.famerp.ru
require_once __DIR__.DIRECTORY_SEPARATOR.'_desk.php';
$staff=desk_staff();
if(is_array($staff) && count($staff)>0){
  _json(array('ok'=>true,'staff'=>$staff,'updated_at'=>time(),'source'=>'desk_fallback'));
}

_json(array('ok'=>false,'staff'=>array(),'updated_at'=>time()));
