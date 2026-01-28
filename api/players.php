<?php
require_once __DIR__.DIRECTORY_SEPARATOR.'_utils.php';

$p=_push_get('players', 60);
if(is_array($p)) _json($p);
require_once __DIR__.DIRECTORY_SEPARATOR.'_a2s.php';
$serverId='10809858';

$serverIp='212.22.85.145';
$serverPort=27015;

$urls=array(
  'https://api.gamemonitoring.net/servers/'.$serverId.'/players?limit=200',
  'https://api.gamemonitoring.ru/servers/'.$serverId.'/players?limit=200'
);

$d=null;
foreach($urls as $u){
  $d=_fetch_json_cached('gm_players_'.$serverId.'_'.md5($u), $u, 10);
  if(is_array($d)) break;
}

if(!is_array($d)){
  $a=a2s_players($serverIp,$serverPort,2);
  _json(array('ok'=>true,'players'=>$a,'updated_at'=>time(),'source'=>'a2s'));
}
$r=isset($d['response']) ? $d['response'] : $d;
$players=array();
if(is_array($r)){
  if(isset($r['players']) && is_array($r['players'])) $players=$r['players'];
  else $players=$r;
}
if(!is_array($players)) $players=array();
$out=array();
foreach($players as $p){
  if(is_array($p)){
    $out[]=array(
      'name'=>isset($p['name'])?$p['name']:(isset($p['nickname'])?$p['nickname']:(isset($p['player'])?$p['player']:'')),
      'score'=>isset($p['score'])?$p['score']:(isset($p['frags'])?$p['frags']:null),
      'time'=>isset($p['time'])?$p['time']:(isset($p['time_played'])?$p['time_played']:null)
    );
  }else{
    $out[]=array('name'=>(string)$p);
  }
}

if(count($out)===0){
  $a=a2s_players($serverIp,$serverPort,2);
  if(is_array($a) && count($a)>0) _json(array('ok'=>true,'players'=>$a,'updated_at'=>time(),'source'=>'a2s'));
}

_json(array('ok'=>true,'players'=>$out,'updated_at'=>time(),'source'=>'gamemonitoring'));
