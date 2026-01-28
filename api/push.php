<?php
require_once __DIR__.DIRECTORY_SEPARATOR.'_utils.php';
require_once __DIR__.DIRECTORY_SEPARATOR.'_config.php';

$key=isset($_GET['key'])?$_GET['key']:'';
if(!$key && isset($_SERVER['HTTP_X_PUSH_KEY'])) $key=$_SERVER['HTTP_X_PUSH_KEY'];
if(!$PUSH_KEY || $key!==$PUSH_KEY){ http_response_code(403); _json(array('ok'=>false)); }

$raw=file_get_contents('php://input');
$data=@json_decode($raw,true);
if(!is_array($data)){ http_response_code(400); _json(array('ok'=>false)); }

$allowed=array('server','players','staff','bans','economy','rules');
foreach($allowed as $k){
  if(isset($data[$k]) && is_array($data[$k])){
    $payload=$data[$k];
    if(!isset($payload['updated_at'])) $payload['updated_at']=time();
    _push_set($k, $payload);
  }
}
_json(array('ok'=>true,'time'=>time()));
