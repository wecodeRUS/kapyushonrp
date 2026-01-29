<?php
require_once __DIR__.DIRECTORY_SEPARATOR.'_utils.php';

// 1) Сначала берем пуш (если он не пустой)
$p=_push_get('economy', 31536000);
if(is_array($p) && isset($p['players']) && is_array($p['players']) && count($p['players'])>0){
  _json($p);
}

// 2) Фолбек: пробуем забрать данные напрямую с desk.famerp.ru (без playwright)
require_once __DIR__.DIRECTORY_SEPARATOR.'_desk.php';
$list=desk_economy();

// Нормализация денег
$norm=array();
foreach($list as $it){
  if(!is_array($it)) continue;
  $name=isset($it['nickname'])?$it['nickname']:(isset($it['name'])?$it['name']:'');
  $steamid=isset($it['steamid'])?$it['steamid']:(isset($it['steamId'])?$it['steamId']:(isset($it['steam'])?$it['steam']:''));
  $money=isset($it['money'])?$it['money']:(isset($it['balance'])?$it['balance']:(isset($it['cash'])?$it['cash']:0));
  $play=isset($it['playtime'])?$it['playtime']:(isset($it['time'])?$it['time']:'');
  $m=0;
  if(is_numeric($money)) $m=(float)$money;
  else $m=(float)preg_replace('/[^0-9\-\.]/','',(string)$money);
  $norm[]=array('nickname'=>$name,'name'=>$name,'steamid'=>$steamid,'money'=>$m,'playtime'=>$play,'time'=>$play);
}

if(count($norm)===0){
  _json(array('ok'=>false,'players'=>array(),'top3'=>array(),'updated_at'=>time()));
}

usort($norm, function($a,$b){
  $aa=isset($a['money'])?(float)$a['money']:0;
  $bb=isset($b['money'])?(float)$b['money']:0;
  if($aa==$bb) return 0;
  return ($aa<$bb)?1:-1;
});
$top3=array_slice($norm,0,3);
_json(array('ok'=>true,'players'=>$norm,'top3'=>$top3,'updated_at'=>time(),'source'=>'desk_fallback'));
