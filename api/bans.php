<?php
require_once __DIR__.DIRECTORY_SEPARATOR.'_utils.php';

$p=_push_get('bans', 31536000);
if(is_array($p) && isset($p['bans']) && is_array($p['bans']) && count($p['bans'])>0){
  _json($p);
}

require_once __DIR__.DIRECTORY_SEPARATOR.'_desk.php';
$bans=desk_bans();
if(is_array($bans) && count($bans)>0){
  _json(array('ok'=>true,'bans'=>$bans,'updated_at'=>time(),'source'=>'desk_fallback'));
}

_json(array('ok'=>false,'bans'=>array(),'updated_at'=>time()));
