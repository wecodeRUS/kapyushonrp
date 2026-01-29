<?php
require_once __DIR__.DIRECTORY_SEPARATOR.'_utils.php';

$p=_push_get('server', 30);
if(is_array($p)) _json($p);

$serverId='10809858';

$urls=array(
  'https://api.gamemonitoring.net/servers/'.$serverId,
  'https://api.gamemonitoring.ru/servers/'.$serverId
);

$d=null;
foreach($urls as $u){
  $d=_fetch_json_cached('gm_server_'.$serverId.'_'.md5($u), $u, 10);
  if(is_array($d)) break;
}

if(!is_array($d)) _json(array('ok'=>false));
$r=isset($d['response']) && is_array($d['response']) ? $d['response'] : $d;
$connect=isset($r['connect']) ? $r['connect'] : null;
if(!$connect){
  if(isset($r['ip']) && isset($r['port'])) $connect=$r['ip'].':'.$r['port'];
  if(!$connect && isset($r['address'])) $connect=$r['address'];
}
_json(array(
  'ok'=>true,
  'name'=>isset($r['name'])?$r['name']:'',
  'online'=>isset($r['numplayers'])?$r['numplayers']:(isset($r['online'])?$r['online']:null),
  'max'=>isset($r['maxplayers'])?$r['maxplayers']:(isset($r['max'])?$r['max']:null),
  'map'=>isset($r['map'])?$r['map']:'',
  'connect'=>$connect,
  'last_update'=>isset($r['last_update'])?$r['last_update']:(isset($r['updated'])?$r['updated']:null),
  'updated_at'=>time()
));
