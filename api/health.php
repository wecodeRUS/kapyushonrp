<?php
require_once __DIR__.DIRECTORY_SEPARATOR.'_utils.php';
$out=array('ok'=>true,'time'=>time());
$push=array();
foreach(array('server','players','staff','bans','economy','rules') as $k){
  $p=_push_get($k, 31536000);
  if(is_array($p)){
    $cnt=null;
    if(isset($p['staff']) && is_array($p['staff'])) $cnt=count($p['staff']);
    if(isset($p['bans']) && is_array($p['bans'])) $cnt=count($p['bans']);
    if(isset($p['players']) && is_array($p['players'])) $cnt=count($p['players']);
    if(isset($p['sections']) && is_array($p['sections'])) $cnt=count($p['sections']);
    $push[$k]=array('ok'=>true,'updated_at'=>isset($p['updated_at'])?$p['updated_at']:null,'count'=>$cnt);
  }
}
$out['push']=$push;
_json($out);
